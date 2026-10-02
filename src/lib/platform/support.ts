import { Types } from "mongoose";
import Tenant from "@/models/Tenant";
import User from "@/models/User";
import { ISupportTicket, SupportMessage, SupportTicket, TICKET_CATEGORIES, TICKET_PRIORITIES } from "@/models/platform";
import { ApiError } from "./http";
import { formatNumber, nextNumber, sessionOpt, withTxn } from "./db";
import { enqueueEmail, templates } from "./email";
import { getSetting } from "./settings";

export const MAX_MESSAGE_LENGTH = 4000;

export function cleanBody(body: unknown): string {
  const text = typeof body === "string" ? body.replace(/\r\n/g, "\n").trim() : "";
  if (!text) throw new ApiError(400, "VALIDATION_ERROR", "Message cannot be empty");
  if (text.length > MAX_MESSAGE_LENGTH) throw new ApiError(400, "VALIDATION_ERROR", `Message must be at most ${MAX_MESSAGE_LENGTH} characters`);
  return text;
}

/** 30 messages / hour / user (architecture §7.6). */
export async function assertMessageRate(field: "sender_agency_user_id" | "sender_platform_user_id", userId: string) {
  const count = await SupportMessage.countDocuments({ [field]: userId, created_at: { $gte: new Date(Date.now() - 3_600_000) } });
  if (count >= 30) throw new ApiError(429, "RATE_LIMITED", "Message limit reached (30 per hour). Please try again later.");
}

/** Assignee at creation = agency's sales owner, if active; else unassigned. */
async function routeAssignee(agencyId: Types.ObjectId) {
  const agency = await Tenant.findById(agencyId).select("sales_owner_id").lean();
  if (!agency?.sales_owner_id) return null;
  const owner = await User.findById(agency.sales_owner_id).select("is_active").lean();
  return owner && owner.is_active !== false ? (agency.sales_owner_id as Types.ObjectId) : null;
}

export async function createTicket(input: {
  agency_id: string;
  user: { id: string; name: string };
  subject: string;
  category: string;
  priority: string;
  body: string;
}) {
  const subject = (input.subject || "").trim().slice(0, 200);
  if (!subject) throw new ApiError(400, "VALIDATION_ERROR", "Subject is required");
  const category = ((TICKET_CATEGORIES as readonly string[]).includes(input.category) ? input.category : "OTHER") as ISupportTicket["category"];
  const priority = ((TICKET_PRIORITIES as readonly string[]).includes(input.priority) ? input.priority : "NORMAL") as ISupportTicket["priority"];
  const body = cleanBody(input.body);
  await assertMessageRate("sender_agency_user_id", input.user.id);
  const agencyId = new Types.ObjectId(input.agency_id);
  const assignee = await routeAssignee(agencyId);

  const ticket = await withTxn(async (session) => {
    const n = await nextNumber("ticket", session);
    const now = new Date();
    const [t] = await SupportTicket.create(
      [{ ticket_number: formatNumber("TKT", n), agency_id: agencyId, created_by_agency_user_id: new Types.ObjectId(input.user.id), subject, category, priority, status: "OPEN" as const, assigned_to_platform_user_id: assignee, last_message_at: now, last_message_by: "AGENCY" as const, agency_last_read_at: now }],
      sessionOpt(session)
    );
    await SupportMessage.create(
      [{ ticket_id: t._id, agency_id: agencyId, sender_type: "AGENCY_USER", sender_agency_user_id: input.user.id, sender_name: input.user.name, body, created_at: now }],
      sessionOpt(session)
    );
    const toggles = await getSetting("notification_toggles");
    if (toggles.ticket_emails) {
      const agency = await Tenant.findById(agencyId).select("name").session(session).lean();
      const recipients = assignee
        ? await User.find({ _id: assignee }).select("email").session(session).lean()
        : await User.find({ role: "Manager", is_active: { $ne: false } }).select("email").session(session).lean();
      const tpl = await templates.ticketNew({ ticket_number: t.ticket_number, subject, agency_name: agency?.name ?? "" });
      for (const r of recipients) {
        await enqueueEmail({ to: r.email, ...tpl, category: "SUPPORT", related_type: "ticket", related_id: String(t._id), idempotency_key: `ticket-new:${t._id}:${r._id}` }, session);
      }
    }
    return t.toObject() as ISupportTicket;
  });
  return ticket;
}

export async function agencyReply(ticketId: string, agencyId: string, user: { id: string; name: string }, rawBody: unknown) {
  const body = cleanBody(rawBody);
  await assertMessageRate("sender_agency_user_id", user.id);
  const ticket = await SupportTicket.findOne({ _id: ticketId, agency_id: agencyId });
  if (!ticket) throw new ApiError(404, "NOT_FOUND", "Ticket not found");
  if (ticket.status === "CLOSED") throw new ApiError(409, "TICKET_CLOSED", "This ticket is closed — please open a new ticket");
  const now = new Date();
  const msg = await SupportMessage.create({ ticket_id: ticket._id, agency_id: ticket.agency_id, sender_type: "AGENCY_USER", sender_agency_user_id: user.id, sender_name: user.name, body, created_at: now });
  ticket.last_message_at = now;
  ticket.last_message_by = "AGENCY";
  ticket.agency_last_read_at = now;
  // Agency reply on RESOLVED (or waiting) reopens to OPEN.
  if (ticket.status === "RESOLVED" || ticket.status === "WAITING_ON_CUSTOMER") {
    ticket.status = "OPEN";
    ticket.resolved_at = null;
  }
  await ticket.save();
  return msg.toObject();
}

export async function staffReply(ticketId: string, staff: { id: string; name: string }, rawBody: unknown) {
  const body = cleanBody(rawBody);
  await assertMessageRate("sender_platform_user_id", staff.id);
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) throw new ApiError(404, "NOT_FOUND", "Ticket not found");
  if (ticket.status === "CLOSED") throw new ApiError(409, "TICKET_CLOSED", "This ticket is closed");
  const now = new Date();
  const msg = await SupportMessage.create({ ticket_id: ticket._id, agency_id: ticket.agency_id, sender_type: "PLATFORM_USER", sender_platform_user_id: staff.id, sender_name: staff.name, body, created_at: now });
  ticket.last_message_at = now;
  ticket.last_message_by = "STAFF";
  ticket.staff_last_read_at = now;
  if (ticket.status === "OPEN") ticket.status = "IN_PROGRESS";
  await ticket.save();

  const toggles = await getSetting("notification_toggles");
  if (toggles.ticket_emails) {
    const agency = await Tenant.findById(ticket.agency_id).select("owner_email contact_email").lean();
    const to = agency?.owner_email || agency?.contact_email;
    if (to) {
      const tpl = await templates.ticketReply({ ticket_number: ticket.ticket_number, subject: ticket.subject });
      await enqueueEmail({ to, ...tpl, category: "SUPPORT", related_type: "ticket", related_id: String(ticket._id), idempotency_key: `ticket-reply:${msg._id}` });
    }
  }
  return msg.toObject();
}

/** Unread for agency = last message by STAFF after agency_last_read_at. */
export function agencyUnreadFilter(agencyId: string) {
  return {
    agency_id: new Types.ObjectId(agencyId),
    last_message_by: "STAFF" as const,
    $expr: { $or: [{ $eq: ["$agency_last_read_at", null] }, { $gt: ["$last_message_at", "$agency_last_read_at"] }] },
  };
}

export function staffUnreadExpr() {
  return { $or: [{ $eq: ["$staff_last_read_at", null] }, { $gt: ["$last_message_at", "$staff_last_read_at"] }] };
}
