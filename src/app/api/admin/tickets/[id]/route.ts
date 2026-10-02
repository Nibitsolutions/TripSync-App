import { NextRequest, NextResponse } from "next/server";
import Tenant from "@/models/Tenant";
import User from "@/models/User";
import { SupportMessage, SupportTicket, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from "@/models/platform";
import { withPlatform, readJson, assertAgencyInScope, oid, ApiError } from "@/lib/platform/http";
import { can } from "@/lib/platform/permissions";
import { platformActor, writeAudit } from "@/lib/platform/audit";

// GET /api/admin/tickets/[id] - Thread
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withPlatform(req, "support.read", async (ctx) => {
    const { id } = await params;
    const ticket = await SupportTicket.findById(oid(id)).lean();
    if (!ticket) throw new ApiError(404, "NOT_FOUND", "Ticket not found");
    await assertAgencyInScope(ctx.user, ticket.agency_id);
    const [messages, agency, assignee] = await Promise.all([
      SupportMessage.find({ ticket_id: ticket._id }).sort({ created_at: 1 }).limit(1000).lean(),
      Tenant.findById(ticket.agency_id).select("name status owner_name owner_email owner_phone sales_owner_id").lean(),
      ticket.assigned_to_platform_user_id ? User.findById(ticket.assigned_to_platform_user_id).select("name").lean() : null,
    ]);
    return NextResponse.json({ ticket: { ...ticket, assignee_name: assignee?.name ?? null }, messages, agency });
  });
}

// PATCH /api/admin/tickets/[id] - Status / priority / category; assignee needs support.reassign
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withPlatform(req, "support.reply", async (ctx) => {
    const { id } = await params;
    const b = await readJson<Record<string, string | null>>(req);
    const ticket = await SupportTicket.findById(oid(id));
    if (!ticket) throw new ApiError(404, "NOT_FOUND", "Ticket not found");
    await assertAgencyInScope(ctx.user, ticket.agency_id);
    const before = { status: ticket.status, priority: ticket.priority, category: ticket.category, assigned_to: ticket.assigned_to_platform_user_id };
    if (b.status) {
      if (!(TICKET_STATUSES as readonly string[]).includes(b.status)) throw new ApiError(400, "VALIDATION_ERROR", "Invalid status");
      ticket.status = b.status as typeof ticket.status;
      if (b.status === "RESOLVED") ticket.resolved_at = new Date();
      if (b.status === "CLOSED") ticket.closed_at = new Date();
      if (b.status !== "RESOLVED" && b.status !== "CLOSED") {
        ticket.resolved_at = null;
        ticket.closed_at = null;
      }
    }
    if (b.priority) {
      if (!(TICKET_PRIORITIES as readonly string[]).includes(b.priority)) throw new ApiError(400, "VALIDATION_ERROR", "Invalid priority");
      ticket.priority = b.priority as typeof ticket.priority;
    }
    if (b.category) {
      if (!(TICKET_CATEGORIES as readonly string[]).includes(b.category)) throw new ApiError(400, "VALIDATION_ERROR", "Invalid category");
      ticket.category = b.category as typeof ticket.category;
    }
    if (b.assigned_to !== undefined) {
      if (!can(ctx.user.role, "support.reassign")) throw new ApiError(403, "FORBIDDEN", "You cannot reassign tickets");
      if (b.assigned_to) {
        const u = await User.findOne({ _id: b.assigned_to, role: { $in: ["SuperAdmin", "Manager", "SalesExecutive"] }, is_active: { $ne: false } }).lean();
        if (!u) throw new ApiError(400, "VALIDATION_ERROR", "Assignee must be an active platform user");
        ticket.assigned_to_platform_user_id = u._id as typeof ticket.assigned_to_platform_user_id;
      } else ticket.assigned_to_platform_user_id = null;
    }
    await ticket.save();
    const after = { status: ticket.status, priority: ticket.priority, category: ticket.category, assigned_to: ticket.assigned_to_platform_user_id };
    await writeAudit(platformActor(ctx), { action: b.assigned_to !== undefined ? "ticket.reassign" : "ticket.update", entity_type: "support_ticket", entity_id: ticket._id, agency_id: ticket.agency_id, before, after });
    return NextResponse.json({ ticket });
  });
}
