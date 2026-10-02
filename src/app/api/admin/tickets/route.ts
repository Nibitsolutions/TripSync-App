import { NextRequest } from "next/server";
import { Types } from "mongoose";
import Tenant from "@/models/Tenant";
import User from "@/models/User";
import { SupportTicket } from "@/models/platform";
import { withPlatform, pagination, listResponse, scopeByAgency, escapeRegex } from "@/lib/platform/http";
import { staffUnreadExpr } from "@/lib/platform/support";

// GET /api/admin/tickets - Staff inbox (row-scoped for Sales Executives)
export async function GET(req: NextRequest) {
  return withPlatform(req, "support.read", async (ctx) => {
    const url = new URL(req.url);
    const sp = url.searchParams;
    const filter: Record<string, unknown> = {};
    const status = sp.get("status");
    if (status === "open_all") filter.status = { $in: ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER"] };
    else if (status) filter.status = { $in: status.split(",") };
    for (const k of ["category", "priority"]) if (sp.get(k)) filter[k] = sp.get(k);
    const assignee = sp.get("assignee");
    if (assignee === "unassigned") filter.assigned_to_platform_user_id = null;
    else if (assignee === "me") filter.assigned_to_platform_user_id = new Types.ObjectId(ctx.user.id);
    else if (assignee && Types.ObjectId.isValid(assignee)) filter.assigned_to_platform_user_id = new Types.ObjectId(assignee);
    const agency = sp.get("agency_id");
    if (agency && Types.ObjectId.isValid(agency)) filter.agency_id = new Types.ObjectId(agency);
    if (sp.get("unread") === "1") filter.$expr = staffUnreadExpr();
    const q = (sp.get("q") || "").trim();
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      const agencies = await Tenant.find({ name: rx }).select("_id").limit(200).lean();
      filter.$or = [{ subject: rx }, { ticket_number: rx }, { agency_id: { $in: agencies.map((a) => a._id) } }];
    }
    const scoped = await scopeByAgency(ctx.user, filter);
    const { page, page_size, skip } = pagination(url);
    const [rows, total] = await Promise.all([
      SupportTicket.find(scoped).sort({ last_message_at: -1 }).skip(skip).limit(page_size).lean(),
      SupportTicket.countDocuments(scoped),
    ]);
    const agencies = new Map((await Tenant.find({ _id: { $in: rows.map((r) => r.agency_id) } }).select("name").lean()).map((a) => [String(a._id), a.name]));
    const staff = new Map((await User.find({ _id: { $in: rows.map((r) => r.assigned_to_platform_user_id).filter(Boolean) } }).select("name").lean()).map((u) => [String(u._id), u.name]));
    const data = rows.map((r) => ({
      ...r,
      agency_name: agencies.get(String(r.agency_id)) ?? "-",
      assignee_name: r.assigned_to_platform_user_id ? staff.get(String(r.assigned_to_platform_user_id)) ?? null : null,
      unread: !r.staff_last_read_at || new Date(r.last_message_at) > new Date(r.staff_last_read_at),
      waiting_since: r.last_message_by === "AGENCY" && !["RESOLVED", "CLOSED"].includes(r.status) ? r.last_message_at : null,
    }));
    return listResponse(data, page, page_size, total);
  });
}
