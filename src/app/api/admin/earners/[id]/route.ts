import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import Tenant from "@/models/Tenant";
import { CommissionEarner, CommissionEntry, CommissionPayout, Order, PromoCode } from "@/models/platform";
import { withPlatform, readJson, ApiError, oid } from "@/lib/platform/http";
import { earnerBalances, earnerPerformance } from "@/lib/platform/commissions";
import { platformActor, writeAudit } from "@/lib/platform/audit";

// GET /api/admin/earners/[id] - Ledger, payouts, codes and attributed orders
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withPlatform(req, "earners.read", async (ctx) => {
    const { id } = await params;
    const earner = await CommissionEarner.findById(oid(id)).lean();
    if (!earner) throw new ApiError(404, "NOT_FOUND", "Earner not found");
    if (ctx.user.role === "SalesExecutive" && String(earner.platform_user_id) !== ctx.user.id) throw new ApiError(404, "NOT_FOUND", "Earner not found");
    const eid = earner._id as Types.ObjectId;
    const [entries, payouts, codes, balances, { perf }] = await Promise.all([
      CommissionEntry.find({ earner_id: eid }).sort({ created_at: -1 }).limit(500).lean(),
      CommissionPayout.find({ earner_id: eid }).sort({ paid_at: -1 }).lean(),
      PromoCode.find({ owner_earner_id: eid }).sort({ created_at: -1 }).lean(),
      earnerBalances([eid]),
      earnerPerformance([eid]),
    ]);
    const orders = await Order.find({ _id: { $in: entries.map((e) => e.order_id) } }).select("order_number agency_id total_due type status approved_at").lean();
    const agencies = new Map((await Tenant.find({ _id: { $in: orders.map((o) => o.agency_id) } }).select("name").lean()).map((a) => [String(a._id), a.name]));
    const orderMap = new Map(orders.map((o) => [String(o._id), { ...o, agency_name: agencies.get(String(o.agency_id)) ?? "-" }]));
    return NextResponse.json({
      earner,
      balance: balances.get(String(eid)) ?? { accrued: 0, reversed: 0, paid: 0, outstanding: 0 },
      performance: perf.get(String(eid)) ?? { orders: 0, revenue: 0, discount: 0 },
      entries: entries.map((e) => ({ ...e, order: orderMap.get(String(e.order_id)) ?? null })),
      payouts,
      codes,
    });
  });
}

// PATCH /api/admin/earners/[id] - Edit contact, commission terms, active flag
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withPlatform(req, "earners.write", async (ctx) => {
    const { id } = await params;
    const b = await readJson<Record<string, unknown>>(req);
    const earner = await CommissionEarner.findById(oid(id));
    if (!earner) throw new ApiError(404, "NOT_FOUND", "Earner not found");
    const before = earner.toObject();
    if (b.name !== undefined) earner.name = String(b.name).trim() || earner.name;
    if (b.phone !== undefined) earner.phone = String(b.phone);
    if (b.email !== undefined) earner.email = String(b.email);
    if (b.notes !== undefined) earner.notes = String(b.notes);
    if (b.commission_percent !== undefined) {
      const pct = Number(b.commission_percent);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new ApiError(400, "VALIDATION_ERROR", "Commission percent must be 0–100");
      earner.commission_percent = pct;
    }
    if (b.commission_scope !== undefined) earner.commission_scope = b.commission_scope === "ALL_PAYMENTS" ? "ALL_PAYMENTS" : "FIRST_PAYMENT_ONLY";
    if (b.is_active !== undefined) earner.is_active = Boolean(b.is_active);
    await earner.save();
    await writeAudit(platformActor(ctx), { action: "earner.edit", entity_type: "commission_earner", entity_id: earner._id, before, after: earner.toObject() });
    return NextResponse.json({ earner });
  });
}
