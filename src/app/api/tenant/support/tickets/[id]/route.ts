import { NextResponse } from "next/server";
import { SupportMessage, SupportTicket } from "@/models/platform";
import { withTenant } from "@/lib/platform/tenant-guard";
import { oid } from "@/lib/platform/http";

// GET /api/tenant/support/tickets/[id] - Thread (agency B can never read agency A's ticket)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withTenant(async (user) => {
    const { id } = await params;
    const ticket = await SupportTicket.findOne({ _id: oid(id), agency_id: user.tenant_id }).select("-assigned_to_platform_user_id -staff_last_read_at").lean();
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    const messages = await SupportMessage.find({ ticket_id: ticket._id, agency_id: user.tenant_id })
      .select("sender_type sender_name body created_at")
      .sort({ created_at: 1 })
      .limit(1000)
      .lean();
    return NextResponse.json({ ticket, messages });
  });
}
