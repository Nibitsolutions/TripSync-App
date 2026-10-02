import { NextResponse } from "next/server";
import { SupportTicket } from "@/models/platform";
import { withTenant } from "@/lib/platform/tenant-guard";
import { readJson } from "@/lib/platform/http";
import { createTicket } from "@/lib/platform/support";

// GET /api/tenant/support/tickets - Own agency's tickets
export async function GET() {
  return withTenant(async (user) => {
    const rows = await SupportTicket.find({ agency_id: user.tenant_id }).sort({ last_message_at: -1 }).limit(200).lean();
    return NextResponse.json({
      data: rows.map((t) => ({
        ...t,
        unread: t.last_message_by === "STAFF" && (!t.agency_last_read_at || new Date(t.last_message_at) > new Date(t.agency_last_read_at)),
      })),
    });
  });
}

// POST /api/tenant/support/tickets - Create a ticket (allowed while EXPIRED)
export async function POST(req: Request) {
  return withTenant(async (user) => {
    const b = await readJson<{ subject?: string; category?: string; priority?: string; body?: string }>(req);
    const ticket = await createTicket({
      agency_id: user.tenant_id,
      user: { id: user.user_id, name: user.name },
      subject: b.subject || "",
      category: b.category || "OTHER",
      priority: b.priority || "NORMAL",
      body: b.body || "",
    });
    return NextResponse.json({ ticket }, { status: 201 });
  });
}
