import { Types } from "mongoose";
import Tenant from "@/models/Tenant";
import User from "@/models/User";
import { CommissionEarner, CommissionEntry, CommissionPayout, Order, PlatformCost, PromoCode, SubscriptionPeriod } from "@/models/platform";
import { effectiveStatusCondition } from "./agency-query";

// Overview metrics (architecture §7.1) — aggregate numbers only, computed with
// indexed aggregations (no per-agency business data is ever read).

export interface Range {
  from: Date;
  to: Date;
}

const sum = async (model: typeof Order, match: Record<string, unknown>, field: string) =>
  ((await model.aggregate([{ $match: match }, { $group: { _id: null, t: { $sum: `$${field}` }, n: { $sum: 1 } } }]))[0] as { t: number; n: number } | undefined) ?? { t: 0, n: 0 };

export async function overviewSummary(range: Range) {
  const now = new Date();
  const inRange = { $gte: range.from, $lte: range.to };
  const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

  const [revenue, pendingByMethod, pendingByCollector, newBySource, statusCounts, expiring7, expiring14, expiring30, discounts, commissionAccrued, payouts, outstanding, costs, revenueSeries] = await Promise.all([
    sum(Order, { status: "APPROVED", approved_at: inRange }, "total_due"),
    Order.aggregate([{ $match: { status: "PENDING" } }, { $group: { _id: "$payment_method", total: { $sum: "$total_due" }, count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: { status: "PENDING" } }, { $group: { _id: "$collected_by_platform_user_id", total: { $sum: "$total_due" }, count: { $sum: 1 } } }]),
    Tenant.aggregate([{ $match: { created_at: inRange } }, { $group: { _id: "$source", n: { $sum: 1 } } }]),
    Promise.all(
      ["TRIAL", "ACTIVE", "EXPIRED", "SUSPENDED", "OFFBOARDED", "PENDING", "COLD_STORAGE"].map(async (s) => [s, await Tenant.countDocuments(effectiveStatusCondition(s, now))] as const)
    ),
    Tenant.countDocuments({ status: { $in: ["TRIAL", "ACTIVE"] }, access_expires_at: { $gt: now, $lte: days(7) } }),
    Tenant.countDocuments({ status: { $in: ["TRIAL", "ACTIVE"] }, access_expires_at: { $gt: now, $lte: days(14) } }),
    Tenant.countDocuments({ status: { $in: ["TRIAL", "ACTIVE"] }, access_expires_at: { $gt: now, $lte: days(30) } }),
    Order.aggregate([{ $match: { status: "APPROVED", approved_at: inRange } }, { $group: { _id: null, campaign: { $sum: "$campaign_discount" }, promo: { $sum: "$promo_discount" } } }]),
    CommissionEntry.aggregate([{ $match: { created_at: inRange } }, { $group: { _id: null, t: { $sum: "$amount" } } }]),
    CommissionPayout.aggregate([{ $match: { paid_at: inRange } }, { $group: { _id: null, t: { $sum: "$amount" } } }]),
    CommissionEntry.aggregate([{ $match: { status: "ACCRUED" } }, { $group: { _id: null, t: { $sum: "$amount" } } }]),
    PlatformCost.aggregate([{ $match: { voided_at: null, cost_date: inRange } }, { $group: { _id: "$category", t: { $sum: "$amount" } } }]),
    Order.aggregate([
      { $match: { status: "APPROVED", approved_at: inRange } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$approved_at", timezone: "Asia/Karachi" } }, total: { $sum: "$total_due" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  // Trials started / converted, cohort by start month.
  const trialCohorts = await Tenant.aggregate([
    { $match: { trial_ends_at: { $ne: null }, created_at: inRange } },
    { $lookup: { from: "platform_orders", let: { a: "$_id" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$agency_id", "$$a"] }, { $eq: ["$status", "APPROVED"] }] } } }, { $limit: 1 }], as: "paid" } },
    { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$created_at", timezone: "Asia/Karachi" } }, started: { $sum: 1 }, converted: { $sum: { $cond: [{ $gt: [{ $size: "$paid" }, 0] }, 1, 0] } } } },
    { $sort: { _id: 1 } },
  ]);
  const trialsStarted = trialCohorts.reduce((s, c) => s + c.started, 0);
  const trialsConverted = trialCohorts.reduce((s, c) => s + c.converted, 0);

  // Churn: expired for 30+ days with no approved order after expiry.
  const churnCandidates = await Tenant.find({ ...effectiveStatusCondition("EXPIRED", now), access_expires_at: { $lte: days(-30), $gte: new Date(range.from.getTime() - 30 * 86_400_000) } })
    .select("_id access_expires_at")
    .lean();
  let churn = 0;
  for (const c of churnCandidates) {
    const renewed = await Order.exists({ agency_id: c._id, status: "APPROVED", approved_at: { $gt: c.access_expires_at } });
    if (!renewed) churn++;
  }

  // Recurring run-rate: Σ over active periods of total_due / months.
  const runRate = await SubscriptionPeriod.aggregate([
    { $match: { voided_at: null, source: "ORDER", starts_at: { $lte: now }, ends_at: { $gt: now } } },
    { $lookup: { from: "platform_orders", localField: "order_id", foreignField: "_id", as: "o" } },
    { $unwind: "$o" },
    { $match: { "o.months": { $gt: 0 } } },
    { $group: { _id: null, t: { $sum: { $divide: ["$o.total_due", "$o.months"] } } } },
  ]);

  // By salesperson (agency sales owner) and by earner (commission attribution).
  const bySales = await Order.aggregate([
    { $match: { status: "APPROVED", approved_at: inRange } },
    { $lookup: { from: "tenants", localField: "agency_id", foreignField: "_id", as: "a" } },
    { $unwind: "$a" },
    { $match: { "a.sales_owner_id": { $ne: null } } },
    { $group: { _id: "$a.sales_owner_id", orders: { $sum: 1 }, revenue: { $sum: "$total_due" } } },
  ]);
  const byEarner = await CommissionEntry.aggregate([
    { $match: { created_at: inRange } },
    { $lookup: { from: "platform_orders", localField: "order_id", foreignField: "_id", as: "o" } },
    { $unwind: "$o" },
    { $group: { _id: "$earner_id", commission: { $sum: "$amount" }, orders: { $sum: { $cond: [{ $eq: ["$kind", "ACCRUAL"] }, 1, 0] } }, revenue: { $sum: { $cond: [{ $eq: ["$kind", "ACCRUAL"] }, "$o.total_due", { $multiply: ["$o.total_due", -1] }] } } } },
  ]);
  const userNames = new Map(
    (await User.find({ _id: { $in: [...bySales.map((b) => b._id), ...pendingByCollector.map((p) => p._id).filter(Boolean)] } }).select("name").lean()).map((u) => [String(u._id), u.name])
  );
  const earnerNames = new Map((await CommissionEarner.find({ _id: { $in: byEarner.map((b) => b._id) } }).select("name type").lean()).map((e) => [String(e._id), e]));

  const costsTotal = costs.reduce((s, c) => s + c.t, 0);
  const payoutTotal = payouts[0]?.t ?? 0;
  const totalCosts = costsTotal + payoutTotal;

  return {
    range,
    revenue_collected: revenue.t,
    orders_approved: revenue.n,
    cash_pending: {
      total: pendingByMethod.reduce((s, p) => s + p.total, 0),
      count: pendingByMethod.reduce((s, p) => s + p.count, 0),
      by_method: Object.fromEntries(pendingByMethod.map((p) => [p._id, { total: p.total, count: p.count }])),
      by_collector: pendingByCollector.map((p) => ({ id: p._id ? String(p._id) : null, name: p._id ? userNames.get(String(p._id)) ?? "-" : "Customer (online)", total: p.total, count: p.count })),
    },
    new_agencies: { total: newBySource.reduce((s, x) => s + x.n, 0), by_source: Object.fromEntries(newBySource.map((x) => [x._id || "LEGACY", x.n])) },
    trials: { started: trialsStarted, converted: trialsConverted, conversion_rate: trialsStarted ? trialsConverted / trialsStarted : 0, cohorts: trialCohorts },
    status_counts: Object.fromEntries(statusCounts),
    expiring: { d7: expiring7, d14: expiring14, d30: expiring30 },
    churn,
    discounts: { campaign: discounts[0]?.campaign ?? 0, promo: discounts[0]?.promo ?? 0, total: (discounts[0]?.campaign ?? 0) + (discounts[0]?.promo ?? 0) },
    commissions: { accrued: commissionAccrued[0]?.t ?? 0, paid: payoutTotal, outstanding: outstanding[0]?.t ?? 0 },
    costs: { manual: costsTotal, commission_payouts: payoutTotal, total: totalCosts, by_category: Object.fromEntries(costs.map((c) => [c._id, c.t])) },
    net: revenue.t - totalCosts,
    recurring_run_rate: Math.round(runRate[0]?.t ?? 0),
    by_salesperson: bySales.map((b) => ({ id: String(b._id), name: userNames.get(String(b._id)) ?? "-", orders: b.orders, revenue: b.revenue })),
    by_earner: byEarner.map((b) => ({ id: String(b._id), name: earnerNames.get(String(b._id))?.name ?? "-", type: earnerNames.get(String(b._id))?.type ?? "-", orders: b.orders, revenue: b.revenue, commission: b.commission })),
    revenue_series: revenueSeries.map((r) => ({ date: r._id, total: r.total, count: r.count })),
  };
}

/** Sales Executive's own numbers only. */
export async function salesExecSummary(userId: string, range: Range) {
  const uid = new Types.ObjectId(userId);
  const inRange = { $gte: range.from, $lte: range.to };
  const agencies = await Tenant.find({ sales_owner_id: uid }).select("_id status access_expires_at source created_at").lean();
  const ids = agencies.map((a) => a._id);
  const earner = await CommissionEarner.findOne({ platform_user_id: uid }).select("_id").lean();
  const codes = earner ? await PromoCode.find({ owner_earner_id: earner._id }).select("_id code").lean() : [];
  const [pending, approved, ownCash, redemptions, commission] = await Promise.all([
    Order.aggregate([{ $match: { agency_id: { $in: ids }, status: "PENDING" } }, { $group: { _id: null, n: { $sum: 1 }, t: { $sum: "$total_due" } } }]),
    Order.aggregate([{ $match: { agency_id: { $in: ids }, status: "APPROVED", approved_at: inRange } }, { $group: { _id: null, n: { $sum: 1 }, t: { $sum: "$total_due" } } }]),
    Order.aggregate([{ $match: { collected_by_platform_user_id: uid, status: "PENDING" } }, { $group: { _id: null, n: { $sum: 1 }, t: { $sum: "$total_due" } } }]),
    Order.aggregate([{ $match: { promo_code_id: { $in: codes.map((c) => c._id) }, status: { $in: ["PENDING", "APPROVED"] } } }, { $group: { _id: "$promo_code", n: { $sum: 1 } } }]),
    earner ? CommissionEntry.aggregate([{ $match: { earner_id: earner._id } }, { $group: { _id: "$status", t: { $sum: "$amount" } } }]) : [],
  ]);
  const now = new Date();
  return {
    range,
    agencies_onboarded: agencies.filter((a) => a.created_at >= range.from && a.created_at <= range.to).length,
    agencies_total: agencies.length,
    status_counts: agencies.reduce<Record<string, number>>((acc, a) => {
      const s = (a.status === "TRIAL" || a.status === "ACTIVE") && a.access_expires_at && a.access_expires_at <= now ? "EXPIRED" : a.status;
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {}),
    pending_orders: { count: pending[0]?.n ?? 0, total: pending[0]?.t ?? 0 },
    approved_orders: { count: approved[0]?.n ?? 0, total: approved[0]?.t ?? 0 },
    own_pending_cash: { count: ownCash[0]?.n ?? 0, total: ownCash[0]?.t ?? 0 },
    code_redemptions: redemptions.map((r) => ({ code: r._id, count: r.n })),
    commission: Object.fromEntries(commission.map((c: { _id: string; t: number }) => [c._id, c.t])),
  };
}
