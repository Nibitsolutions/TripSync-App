import { NextResponse } from "next/server";
import { SupportTicket } from "@/models/platform";
import { withTenant } from "@/lib/platform/tenant-guard";
import { agencyUnreadFilter } from "@/lib/platform/support";

// GET /api/tenant/support/unread-count - Polled every 30 s while the tab is visible
export async function GET() {
  return withTenant(async (user) => {
    return NextResponse.json({ unread: await SupportTicket.countDocuments(agencyUnreadFilter(user.tenant_id)) });
  });
}
