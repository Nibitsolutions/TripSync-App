import { NextRequest, NextResponse } from "next/server";
import { SupportTicket } from "@/models/platform";
import { withPlatform, scopeByAgency } from "@/lib/platform/http";
import { staffUnreadExpr } from "@/lib/platform/support";

// GET /api/admin/tickets/unread-count - Badge polling (every 20 s while the inbox is visible)
export async function GET(req: NextRequest) {
  return withPlatform(req, "support.read", async (ctx) => {
    const base = await scopeByAgency(ctx.user, { status: { $ne: "CLOSED" }, last_message_by: "AGENCY", $expr: staffUnreadExpr() });
    const [unread, unassigned] = await Promise.all([
      SupportTicket.countDocuments(base),
      ctx.user.role === "SalesExecutive" ? 0 : SupportTicket.countDocuments({ status: { $in: ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER"] }, assigned_to_platform_user_id: null }),
    ]);
    return NextResponse.json({ unread, unassigned });
  });
}
