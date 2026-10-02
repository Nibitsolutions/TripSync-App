import { Types } from "mongoose";
import Tenant, { ITenant } from "@/models/Tenant";
import User from "@/models/User";
import { agencyScope, escapeRegex, PlatformUser } from "./http";
import { getEffectiveStatus, pausedDaysRemaining } from "./lifecycle";
import { daysLeft } from "./db";

/** Mongo condition matching an *effective* status (expiry-aware). */
export function effectiveStatusCondition(status: string, now = new Date()): Record<string, unknown> {
  const notLapsed = { $or: [{ access_expires_at: null }, { access_expires_at: { $gt: now } }] };
  if (status === "ACTIVE" || status === "TRIAL") return { $and: [{ status }, notLapsed] };
  if (status === "EXPIRED") {
    return { $or: [{ status: "EXPIRED" }, { status: { $in: ["TRIAL", "ACTIVE"] }, access_expires_at: { $ne: null, $lte: now } }] };
  }
  return { status };
}

export function agencyFilterFromUrl(url: URL, user: PlatformUser): Record<string, unknown> {
  const sp = url.searchParams;
  const now = new Date();
  const and: Record<string, unknown>[] = [agencyScope(user)];

  const statuses = (sp.get("status") || "").split(",").filter(Boolean);
  if (statuses.length) and.push({ $or: statuses.map((s) => effectiveStatusCondition(s, now)) });
  else if (sp.get("include_archived") !== "1") and.push({ status: { $nin: ["COLD_STORAGE", "PURGED"] } });

  const source = sp.get("source");
  if (source) and.push({ source });
  const owner = sp.get("sales_owner");
  if (owner === "none") and.push({ sales_owner_id: null });
  else if (owner && Types.ObjectId.isValid(owner)) and.push({ sales_owner_id: new Types.ObjectId(owner) });

  const expiring = parseInt(sp.get("expiring_days") || "", 10);
  if (expiring > 0) {
    and.push({ status: { $in: ["TRIAL", "ACTIVE"] }, access_expires_at: { $gt: now, $lte: new Date(now.getTime() + expiring * 86_400_000) } });
  }
  const consent = sp.get("consent");
  if (consent === "yes") and.push({ marketing_consent: true });
  if (consent === "no") and.push({ marketing_consent: { $ne: true } });

  const from = sp.get("created_from");
  const to = sp.get("created_to");
  if (from || to) {
    const c: Record<string, Date> = {};
    if (from) c.$gte = new Date(from);
    if (to) c.$lte = new Date(`${to}T23:59:59.999Z`);
    and.push({ created_at: c });
  }
  if (sp.get("duplicates") === "1") and.push({ possible_duplicate: true });

  const q = (sp.get("q") || "").trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    and.push({ $or: [{ name: rx }, { owner_name: rx }, { owner_email: rx }, { contact_email: rx }, { contact_person: rx }, { owner_phone: rx }, { contact_phone: rx }, { business_phone: rx }] });
  }
  return and.length > 1 ? { $and: and } : and[0];
}

export async function serializeAgencies(rows: ITenant[]) {
  const ids = rows.map((r) => r._id);
  const ownerIds = rows.map((r) => r.sales_owner_id).filter(Boolean) as Types.ObjectId[];
  const [counts, owners, agencyOwners] = await Promise.all([
    User.aggregate([{ $match: { tenant_id: { $in: ids }, is_active: { $ne: false } } }, { $group: { _id: "$tenant_id", n: { $sum: 1 } } }]),
    User.find({ _id: { $in: ownerIds } }).select("name").lean(),
    User.find({ tenant_id: { $in: ids }, role: "Owner" }).select("tenant_id name email").lean(),
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.n as number]));
  const ownerMap = new Map(owners.map((o) => [String(o._id), o.name]));
  const agencyOwnerMap = new Map(agencyOwners.map((o) => [String(o.tenant_id), o]));
  const now = new Date();
  return rows.map((a) => {
    const status = getEffectiveStatus(a, now);
    const owner = agencyOwnerMap.get(String(a._id));
    return {
      _id: String(a._id),
      name: a.name,
      email: a.business_email || a.contact_email || "",
      owner: { name: a.owner_name || owner?.name || a.contact_person || "", email: a.owner_email || owner?.email || "", phone: a.owner_phone || a.contact_phone || "" },
      status,
      stored_status: a.status,
      source: a.source || "LEGACY",
      access_expires_at: a.access_expires_at,
      days_left: status === "SUSPENDED" ? null : daysLeft(a.access_expires_at, now),
      paused_days_remaining: pausedDaysRemaining(a),
      seat_limit: a.max_users,
      branch_limit: a.branch_limit ?? 1,
      user_count: countMap.get(String(a._id)) ?? 0,
      branches_used: 1,
      sales_owner_id: a.sales_owner_id ? String(a.sales_owner_id) : null,
      sales_owner_name: a.sales_owner_id ? ownerMap.get(String(a.sales_owner_id)) ?? null : null,
      marketing_consent: Boolean(a.marketing_consent),
      possible_duplicate: Boolean(a.possible_duplicate),
      last_active_at: a.last_active_at ?? null,
      offboard_reason: a.offboard_reason ?? null,
      offboarded_at: a.offboarded_at ?? null,
      retention_until: a.retention_until ?? null,
      created_at: a.created_at,
    };
  });
}

export async function listAgencies(filter: Record<string, unknown>, sort: Record<string, 1 | -1>, skip: number, limit: number) {
  const [rows, total] = await Promise.all([
    Tenant.find(filter).sort(sort).skip(skip).limit(limit).lean<ITenant[]>(),
    Tenant.countDocuments(filter),
  ]);
  return { rows: await serializeAgencies(rows), total };
}

export const AGENCY_SORTS: Record<string, Record<string, 1 | -1>> = {
  created_desc: { created_at: -1 },
  created_asc: { created_at: 1 },
  expires_asc: { access_expires_at: 1 },
  expires_desc: { access_expires_at: -1 },
  name_asc: { name: 1 },
  last_active_desc: { last_active_at: -1 },
};
