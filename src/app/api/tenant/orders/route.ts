import { NextResponse } from "next/server";
import { Order, Receipt } from "@/models/platform";
import { withTenant } from "@/lib/platform/tenant-guard";
import { readJson, requestMeta, rateLimit } from "@/lib/platform/http";
import { createOrder } from "@/lib/platform/orders";

// GET /api/tenant/orders - Own orders with receipt numbers
export async function GET() {
  return withTenant(async (user) => {
    const orders = await Order.find({ agency_id: user.tenant_id })
      .select("order_number payment_reference type status seats branches term_quarters months total_due lines created_at approved_at reject_reason")
      .sort({ created_at: -1 })
      .limit(100)
      .lean();
    const receipts = new Map((await Receipt.find({ order_id: { $in: orders.map((o) => o._id) } }).select("order_id receipt_number voided_at").lean()).map((r) => [String(r.order_id), r]));
    return NextResponse.json({
      data: orders.map((o) => {
        const r = receipts.get(String(o._id));
        return { ...o, receipt: r ? { id: String(r._id), receipt_number: r.receipt_number, voided: Boolean(r.voided_at) } : null };
      }),
    });
  });
}

// POST /api/tenant/orders - Renewal / upgrade order (PENDING until payment is verified)
export async function POST(req: Request) {
  return withTenant(
    async (user) => {
      rateLimit(`tenant-order:${user.user_id}`, 10, 3_600_000);
      const b = await readJson<{ upgrade?: boolean; seats: number; branches: number; term_quarters: number; promo_code?: string }>(req);
      const result = await createOrder(
        { kind: "agency", user_id: user.user_id, name: user.name, role: user.role, agency_id: user.tenant_id, meta: requestMeta(req) },
        { agency_id: user.tenant_id, upgrade: b.upgrade, seats: b.seats, branches: b.branches, term_quarters: b.term_quarters, promo_code: b.promo_code }
      );
      return NextResponse.json(result, { status: 201 });
    },
    { allowWhenExpired: true, ownerOnly: true }
  );
}
