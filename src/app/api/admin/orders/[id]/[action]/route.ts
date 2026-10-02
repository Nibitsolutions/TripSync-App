import { NextRequest, NextResponse } from "next/server";
import { withPlatform, readJson, requireReason, oid, ApiError, assertAgencyInScope } from "@/lib/platform/http";
import { Permission } from "@/lib/platform/permissions";
import { approveOrder, cancelOrder, rejectOrder, resendReceipt, reverseOrder } from "@/lib/platform/orders";
import { platformActor } from "@/lib/platform/audit";
import { Order } from "@/models/platform";

const ACTIONS: Record<string, Permission> = {
  approve: "orders.approve",
  reject: "orders.reject",
  reverse: "orders.reverse",
  "resend-receipt": "orders.approve",
  cancel: "orders.create",
};

// POST /api/admin/orders/[id]/{approve|reject|reverse|resend-receipt|cancel}
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  const permission = ACTIONS[action];
  if (!permission) return NextResponse.json({ code: "NOT_FOUND", error: "Unknown action" }, { status: 404 });
  return withPlatform(req, permission, async (ctx) => {
    oid(id);
    const body = await readJson<{ reason?: string }>(req);
    switch (action) {
      case "approve":
        return NextResponse.json(await approveOrder(ctx, id));
      case "reject":
        return NextResponse.json({ order: await rejectOrder(ctx, id, requireReason(body.reason)) });
      case "reverse":
        return NextResponse.json({ order: await reverseOrder(ctx, id, requireReason(body.reason)) });
      case "resend-receipt":
        return NextResponse.json({ order: await resendReceipt(ctx, id) });
      case "cancel": {
        const order = await Order.findById(id).select("agency_id").lean();
        if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found");
        await assertAgencyInScope(ctx.user, order.agency_id);
        return NextResponse.json({ order: await cancelOrder(id, null, platformActor(ctx)) });
      }
    }
    throw new ApiError(404, "NOT_FOUND", "Unknown action");
  });
}
