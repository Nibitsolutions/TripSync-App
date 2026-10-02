import { NextRequest, NextResponse } from "next/server";
import { SupportTicket } from "@/models/platform";
import { withPlatform, readJson, assertAgencyInScope, oid, ApiError } from "@/lib/platform/http";
import { staffReply } from "@/lib/platform/support";

// POST /api/admin/tickets/[id]/messages - Staff reply (plain text, ≤ 4,000 chars)
// POST /api/admin/tickets/[id]/read     - Mark read for staff
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  return withPlatform(req, action === "messages" ? "support.reply" : "support.read", async (ctx) => {
    const ticket = await SupportTicket.findById(oid(id)).select("agency_id").lean();
    if (!ticket) throw new ApiError(404, "NOT_FOUND", "Ticket not found");
    await assertAgencyInScope(ctx.user, ticket.agency_id);
    if (action === "messages") {
      const b = await readJson<{ body?: string }>(req);
      const message = await staffReply(id, { id: ctx.user.id, name: ctx.user.name }, b.body);
      return NextResponse.json({ message }, { status: 201 });
    }
    if (action === "read") {
      await SupportTicket.updateOne({ _id: ticket._id }, { $set: { staff_last_read_at: new Date() } });
      return NextResponse.json({ ok: true });
    }
    throw new ApiError(404, "NOT_FOUND", "Unknown action");
  });
}
