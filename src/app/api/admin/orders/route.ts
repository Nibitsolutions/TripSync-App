import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import Tenant from "@/models/Tenant";
import User from "@/models/User";
import { Order } from "@/models/platform";
import { withPlatform, pagination, listResponse, readJson, scopeByAgency, escapeRegex, toCsv, csvResponse } from "@/lib/platform/http";
import { createOrder, CreateOrderInput } from "@/lib/platform/orders";
import { formatPKT } from "@/lib/platform/db";

// GET /api/admin/orders - Orders grid (default: pending approval, oldest first)
export async function GET(req: NextRequest) {
  return withPlatform(req, "orders.read", async (ctx) => {
    const url = new URL(req.url);
    const sp = url.searchParams;
    const filter: Record<string, unknown> = {};
    const status = sp.get("status");
    if (status && status !== "ALL") filter.status = { $in: status.split(",") };
    const type = sp.get("type");
    if (type) filter.type = { $in: type.split(",") };
    const collector = sp.get("collected_by");
    if (collector && Types.ObjectId.isValid(collector)) filter.collected_by_platform_user_id = new Types.ObjectId(collector);
    const method = sp.get("payment_method");
    if (method) filter.payment_method = method;
    const source = sp.get("source");
    if (source) filter.source = source;
    const agency = sp.get("agency_id");
    if (agency && Types.ObjectId.isValid(agency)) filter.agency_id = new Types.ObjectId(agency);
    const from = sp.get("from");
    const to = sp.get("to");
    if (from || to) {
      const c: Record<string, Date> = {};
      if (from) c.$gte = new Date(from);
      if (to) c.$lte = new Date(`${to}T23:59:59.999Z`);
      filter.created_at = c;
    }
    const q = (sp.get("q") || "").trim();
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      const agencies = await Tenant.find({ $or: [{ name: rx }, { owner_email: rx }] }).select("_id").limit(200).lean();
      filter.$or = [{ order_number: rx }, { payment_reference: rx }, { promo_code: rx }, { agency_id: { $in: agencies.map((a) => a._id) } }];
    }
    const scoped = await scopeByAgency(ctx.user, filter);
    const sortKey = sp.get("sort") || (status === "PENDING" ? "created_asc" : "created_desc");
    const sort: Record<string, 1 | -1> = sortKey === "created_asc" ? { created_at: 1 } : sortKey === "total_desc" ? { total_due: -1 } : { created_at: -1 };

    const csv = sp.get("format") === "csv";
    const { page, page_size, skip } = pagination(url);
    const [rows, total] = await Promise.all([
      Order.find(scoped).sort(sort).skip(csv ? 0 : skip).limit(csv ? 10_000 : page_size).lean(),
      Order.countDocuments(scoped),
    ]);
    const agencyMap = new Map(
      (await Tenant.find({ _id: { $in: rows.map((r) => r.agency_id) } }).select("name status owner_email").lean()).map((a) => [String(a._id), a])
    );
    const userIds = rows.flatMap((r) => [r.collected_by_platform_user_id, r.approved_by, r.submitted_by_platform_user_id]).filter(Boolean);
    const userMap = new Map((await User.find({ _id: { $in: userIds } }).select("name").lean()).map((u) => [String(u._id), u.name]));
    const now = Date.now();
    const data = rows.map((r) => ({
      ...r,
      agency_name: agencyMap.get(String(r.agency_id))?.name ?? "-",
      agency_status: agencyMap.get(String(r.agency_id))?.status ?? null,
      collected_by_name: r.collected_by_platform_user_id ? userMap.get(String(r.collected_by_platform_user_id)) ?? null : null,
      approved_by_name: r.approved_by ? userMap.get(String(r.approved_by)) ?? null : null,
      submitted_by_name: r.submitted_by_platform_user_id ? userMap.get(String(r.submitted_by_platform_user_id)) ?? null : null,
      age_days: Math.floor((now - new Date(r.created_at).getTime()) / 86_400_000),
      stale: r.status === "PENDING" && now - new Date(r.created_at).getTime() > 14 * 86_400_000,
    }));
    if (csv) {
      return csvResponse(
        "orders.csv",
        toCsv(
          data.map((d) => ({ ...d, created_at: formatPKT(d.created_at), approved_at: formatPKT(d.approved_at) })),
          ["order_number", "payment_reference", "agency_name", "type", "status", "source", "seats", "branches", "term_quarters", "list_price", "campaign_discount", "promo_code", "promo_discount", "manual_adjustment", "tax_amount", "total_due", "payment_method", "amount_received", "collected_by_name", "created_at", "approved_at", "approved_by_name"]
        )
      );
    }
    const pendingSummary = await Order.aggregate([
      { $match: { ...(await scopeByAgency(ctx.user, {})), status: "PENDING" } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$total_due" } } },
    ]);
    return listResponse(data, page, page_size, total, { pending: pendingSummary[0] ?? { count: 0, total: 0 } });
  });
}

// POST /api/admin/orders - Staff-entered order / payment
export async function POST(req: NextRequest) {
  return withPlatform(req, "orders.create", async (ctx) => {
    const body = await readJson<CreateOrderInput>(req);
    const result = await createOrder({ kind: "platform", ctx }, body);
    return NextResponse.json(result, { status: 201 });
  });
}
