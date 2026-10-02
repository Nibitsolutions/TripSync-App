import { NextResponse } from "next/server";
import { SupportTicket } from "@/models/platform";
import { withTenant } from "@/lib/platform/tenant-guard";
import { oid, readJson } from "@/lib/platform/http";
import { agencyReply } from "@/lib/platform/support";

// POST /api/tenant/support/tickets/[id]/{messages|read|close|resolve}
export async function POST(req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  return withTenant(async (user) => {
    const { id, action } = await params;
    const filter = { _id: oid(id), agency_id: user.tenant_id };
    if (action === "messages") {
      const b = await readJson<{ body?: string }>(req);
      const message = await agencyReply(id, user.tenant_id, { id: user.user_id, name: user.name }, b.body);
      return NextResponse.json({ message }, { status: 201 });
    }
    if (action === "read") {
      await SupportTicket.updateOne(filter, { $set: { agency_last_read_at: new Date() } });
      return NextResponse.json({ ok: true });
    }
    if (action === "close" || action === "resolve") {
      const set = action === "close" ? { status: "CLOSED", closed_at: new Date() } : { status: "RESOLVED", resolved_at: new Date() };
      const t = await SupportTicket.findOneAndUpdate({ ...filter, status: { $ne: "CLOSED" } }, { $set: set }, { returnDocument: "after" }).lean();
      if (!t) return NextResponse.json({ error: "Ticket not found or already closed" }, { status: 404 });
      return NextResponse.json({ ticket: t });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 404 });
  });
}
