import { Types } from "mongoose";
import { CommissionEarner, CommissionEntry, CommissionPayout, Order, PromoCode } from "@/models/platform";
import { ApiError, PlatformContext } from "./http";
import { platformActor, writeAudit } from "./audit";
import { roundHalfUp, sessionOpt, withTxn } from "./db";

export async function earnerBalances(earnerIds: Types.ObjectId[]) {
  const rows = await CommissionEntry.aggregate([
    { $match: { earner_id: { $in: earnerIds } } },
    {
      $group: {
        _id: "$earner_id",
        accrued: { $sum: { $cond: [{ $eq: ["$kind", "ACCRUAL"] }, "$amount", 0] } },
        reversed: { $sum: { $cond: [{ $eq: ["$kind", "REVERSAL"] }, "$amount", 0] } },
        paid: { $sum: { $cond: [{ $eq: ["$status", "PAID"] }, "$amount", 0] } },
        outstanding: { $sum: { $cond: [{ $eq: ["$status", "ACCRUED"] }, "$amount", 0] } },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), { accrued: r.accrued, reversed: r.reversed, paid: r.paid, outstanding: r.outstanding }]));
}

/**
 * Record a manual payout: allocates the earner's unpaid entries oldest first
 * (negative reversal entries net against accruals) up to the payout amount.
 */
export async function recordPayout(
  ctx: PlatformContext,
  input: { earner_id: string; amount: number; paid_at?: string; method?: string; reference?: string; note?: string }
) {
  const amount = roundHalfUp(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(400, "VALIDATION_ERROR", "Amount must be positive");
  return withTxn(async (session) => {
    const earner = await CommissionEarner.findById(input.earner_id).session(session).lean();
    if (!earner) throw new ApiError(404, "NOT_FOUND", "Earner not found");
    const [payout] = await CommissionPayout.create(
      [{ earner_id: earner._id, amount, paid_at: input.paid_at ? new Date(input.paid_at) : new Date(), method: input.method || "", reference: input.reference || "", note: input.note || "", recorded_by: ctx.user.id }],
      sessionOpt(session)
    );
    // Reversals first (they reduce what is owed), then accruals oldest first.
    const unpaid = await CommissionEntry.find({ earner_id: earner._id, status: "ACCRUED" }).sort({ created_at: 1 }).session(session).lean();
    const negatives = unpaid.filter((e) => e.amount < 0);
    const positives = unpaid.filter((e) => e.amount >= 0);
    let budget = amount - negatives.reduce((s, e) => s + e.amount, 0); // subtracting negatives increases budget
    const allocate: Types.ObjectId[] = negatives.map((e) => e._id);
    let allocated = negatives.reduce((s, e) => s + e.amount, 0);
    for (const e of positives) {
      if (e.amount > budget) break;
      budget -= e.amount;
      allocated += e.amount;
      allocate.push(e._id);
    }
    if (allocate.length) {
      await CommissionEntry.updateMany({ _id: { $in: allocate } }, { $set: { status: "PAID", payout_id: payout._id } }, sessionOpt(session));
    }
    await writeAudit(platformActor(ctx), { action: "earner.payout", entity_type: "commission_payout", entity_id: payout._id, after: { earner_id: earner._id, earner: earner.name, amount, allocated, entries: allocate.length } }, session);
    return { payout: payout.toObject(), allocated, entries: allocate.length };
  });
}

export async function earnerPerformance(ids: Types.ObjectId[]) {
  const codes = await PromoCode.find({ owner_earner_id: { $in: ids } }).select("code owner_earner_id is_disabled").lean();
  const codeOwner = new Map(codes.map((c) => [String(c._id), String(c.owner_earner_id)]));
  const perf = await Order.aggregate([
    { $match: { status: "APPROVED", $or: [{ promo_code_id: { $in: codes.map((c) => c._id) } }, { commission_earner_id: { $in: ids } }] } },
    { $project: { promo_code_id: 1, commission_earner_id: 1, total_due: 1, promo_discount: 1 } },
  ]);
  const out = new Map<string, { orders: number; revenue: number; discount: number }>();
  for (const o of perf) {
    const owner = o.commission_earner_id ? String(o.commission_earner_id) : codeOwner.get(String(o.promo_code_id));
    if (!owner) continue;
    const cur = out.get(owner) ?? { orders: 0, revenue: 0, discount: 0 };
    cur.orders++;
    cur.revenue += o.total_due;
    cur.discount += o.promo_discount || 0;
    out.set(owner, cur);
  }
  const codesBy = new Map<string, string[]>();
  for (const c of codes) codesBy.set(String(c.owner_earner_id), [...(codesBy.get(String(c.owner_earner_id)) ?? []), c.code]);
  return { perf: out, codes: codesBy };
}
