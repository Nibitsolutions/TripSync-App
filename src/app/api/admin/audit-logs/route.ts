import { NextRequest } from "next/server";
import { Types } from "mongoose";
import Tenant from "@/models/Tenant";
import { PlatformAuditLog } from "@/models/platform";
import { withPlatform, pagination, listResponse, escapeRegex, toCsv, csvResponse } from "@/lib/platform/http";

// GET /api/admin/audit-logs - Read-only forensic log (?format=csv to export)
export async function GET(req: NextRequest) {
  return withPlatform(req, "audit.read", async () => {
    const url = new URL(req.url);
    const sp = url.searchParams;
    const filter: Record<string, unknown> = {};
    const agency = sp.get("agency_id");
    if (agency && Types.ObjectId.isValid(agency)) filter.agency_id = new Types.ObjectId(agency);
    const actor = sp.get("actor_id");
    if (actor && Types.ObjectId.isValid(actor)) filter.actor_id = new Types.ObjectId(actor);
    if (sp.get("actor_type")) filter.actor_type = sp.get("actor_type");
    if (sp.get("entity_type")) filter.entity_type = sp.get("entity_type");
    if (sp.get("entity_id")) filter.entity_id = sp.get("entity_id");
    const action = (sp.get("action") || "").trim();
    if (action) filter.action = new RegExp(`^${escapeRegex(action)}`, "i");
    const from = sp.get("from");
    const to = sp.get("to");
    if (from || to) {
      const c: Record<string, Date> = {};
      if (from) c.$gte = new Date(from);
      if (to) c.$lte = new Date(`${to}T23:59:59.999Z`);
      filter.occurred_at = c;
    }
    const csv = sp.get("format") === "csv";
    const { page, page_size, skip } = pagination(url);
    const [rows, total] = await Promise.all([
      PlatformAuditLog.find(filter).sort({ occurred_at: -1 }).skip(csv ? 0 : skip).limit(csv ? 20_000 : page_size).lean(),
      PlatformAuditLog.countDocuments(filter),
    ]);
    const names = new Map((await Tenant.find({ _id: { $in: rows.map((r) => r.agency_id).filter(Boolean) } }).select("name").lean()).map((a) => [String(a._id), a.name]));
    const data = rows.map((r) => ({ ...r, agency_name: r.agency_id ? names.get(String(r.agency_id)) ?? null : null }));
    if (csv) {
      return csvResponse(
        "audit-log.csv",
        toCsv(data as unknown as Record<string, unknown>[], ["occurred_at", "actor_type", "actor_name", "actor_role", "action", "entity_type", "entity_id", "agency_name", "reason", "before", "after", "ip", "user_agent", "request_id"])
      );
    }
    return listResponse(data, page, page_size, total);
  });
}
