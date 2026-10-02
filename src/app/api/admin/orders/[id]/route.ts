import { NextRequest, NextResponse } from "next/server";
import Tenant from "@/models/Tenant";
import User from "@/models/User";
import { Campaign, CommissionEarner, CommissionEntry, EmailOutbox, Order, PriceBook, Receipt, SubscriptionPeriod } from "@/models/platform";
import { withPlatform, assertAgencyInScope, oid, ApiError } from "@/lib/platform/http";
import { getEffectiveStatus } from "@/lib/platform/lifecycle";

// GET /api/admin/orders/[id] - Order detail with price snapshot, receipt, period, commission, emails
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withPlatform(req, "orders.read", async (ctx) => {
    const { id } = await params;
    const order = await Order.findById(oid(id)).lean();
    if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found");
    await assertAgencyInScope(ctx.user, order.agency_id);
    const [agency, receipt, period, commissions, emails, priceBook, campaign] = await Promise.all([
      Tenant.findById(order.agency_id).select("name status access_expires_at owner_name owner_email owner_phone max_users branch_limit possible_duplicate").lean(),
      Receipt.findOne({ order_id: order._id }).lean(),
      SubscriptionPeriod.findOne({ order_id: order._id }).lean(),
      CommissionEntry.find({ order_id: order._id }).sort({ created_at: 1 }).lean(),
      EmailOutbox.find({ related_id: String(order._id) }).select("subject category status attempts last_error sent_at created_at to_email").sort({ created_at: -1 }).lean(),
      PriceBook.findById(order.price_book_id).lean(),
      order.campaign_id ? Campaign.findById(order.campaign_id).select("name").lean() : null,
    ]);
    const earnerIds = commissions.map((c) => c.earner_id);
    const earners = new Map((await CommissionEarner.find({ _id: { $in: earnerIds } }).select("name type").lean()).map((e) => [String(e._id), e]));
    const userIds = [order.collected_by_platform_user_id, order.approved_by, order.rejected_by, order.reversed_by, order.submitted_by_platform_user_id, order.submitted_by_agency_user_id].filter(Boolean);
    const users = new Map((await User.find({ _id: { $in: userIds } }).select("name role").lean()).map((u) => [String(u._id), u.name]));
    const name = (v: unknown) => (v ? users.get(String(v)) ?? null : null);
    return NextResponse.json({
      order: {
        ...order,
        collected_by_name: name(order.collected_by_platform_user_id),
        approved_by_name: name(order.approved_by),
        rejected_by_name: name(order.rejected_by),
        reversed_by_name: name(order.reversed_by),
        submitted_by_name: name(order.submitted_by_platform_user_id) ?? name(order.submitted_by_agency_user_id),
        campaign_name: campaign?.name ?? null,
      },
      agency: agency ? { ...agency, status: getEffectiveStatus(agency) } : null,
      receipt,
      period,
      price_book: priceBook,
      commissions: commissions.map((c) => ({ ...c, earner_name: earners.get(String(c.earner_id))?.name ?? "-" })),
      emails,
    });
  });
}
