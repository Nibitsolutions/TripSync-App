import { ClientSession, Types } from "mongoose";
import bcrypt from "bcryptjs";
import Tenant, { ITenant, TenantStatus } from "@/models/Tenant";
import User from "@/models/User";
import { MarketingConsent, SubscriptionPeriod } from "@/models/platform";
import { ApiError, PlatformContext } from "./http";
import { platformActor, writeAudit } from "./audit";
import { addDays, sessionOpt, withTxn } from "./db";
import { getSetting } from "./settings";
import { enqueueEmail, templates } from "./email";
import { randomToken } from "./crypto";
import { sendSetPasswordEmail } from "./tokens";

// ---------------------------------------------------------------------------
// Status helpers (architecture §5)
// ---------------------------------------------------------------------------
const LEGACY: Record<string, TenantStatus> = { Active: "ACTIVE", Suspended: "SUSPENDED", Expired: "EXPIRED" };

export function normalizeStatus(status: string | null | undefined): TenantStatus {
  if (!status) return "ACTIVE";
  return LEGACY[status] ?? (status as TenantStatus);
}

type AgencyLike = Pick<ITenant, "status" | "access_expires_at"> & Partial<ITenant>;

/**
 * Every read of status goes through here: TRIAL/ACTIVE whose expiry has passed
 * are EXPIRED even if the sweep has not persisted it yet (no access past expiry).
 */
export function getEffectiveStatus(agency: AgencyLike, now = new Date()): TenantStatus {
  const s = normalizeStatus(agency.status);
  if ((s === "TRIAL" || s === "ACTIVE") && agency.access_expires_at && new Date(agency.access_expires_at) <= now) {
    return "EXPIRED";
  }
  return s;
}

/** Frozen remaining days for a suspended agency: expires_at − suspended_at. */
export function pausedDaysRemaining(agency: AgencyLike): number | null {
  if (normalizeStatus(agency.status) !== "SUSPENDED" || !agency.access_expires_at || !agency.suspended_at) return null;
  const ms = new Date(agency.access_expires_at).getTime() - new Date(agency.suspended_at).getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

// ---------------------------------------------------------------------------
// In-process status cache (15 s), shared via globalThis so the proxy and route
// handlers in the same process see the same entries and invalidations.
// ---------------------------------------------------------------------------
export interface CachedAgencyState {
  status: TenantStatus;
  session_epoch: number;
  expires_at: Date | null;
  at: number;
}
const g = globalThis as unknown as { __agencyStateCache?: Map<string, CachedAgencyState> };
export const agencyStateCache = (g.__agencyStateCache ??= new Map<string, CachedAgencyState>());

export function invalidateAgency(id: string | Types.ObjectId) {
  agencyStateCache.delete(String(id));
}

export async function getAgencyState(id: string): Promise<CachedAgencyState | null> {
  const hit = agencyStateCache.get(id);
  if (hit && Date.now() - hit.at < 15_000) {
    // Re-evaluate expiry against the clock even on a cache hit.
    return { ...hit, status: getEffectiveStatus({ status: hit.status, access_expires_at: hit.expires_at }) };
  }
  const doc = await Tenant.findById(id).select("status access_expires_at session_epoch").lean<ITenant>();
  if (!doc) return null;
  const state: CachedAgencyState = {
    status: getEffectiveStatus(doc),
    session_epoch: doc.session_epoch ?? 0,
    expires_at: doc.access_expires_at ?? null,
    at: Date.now(),
  };
  agencyStateCache.set(id, state);
  return state;
}

/** One-time migration of legacy status values and missing platform fields. */
export async function migrateLegacyTenants() {
  for (const [legacy, next] of Object.entries(LEGACY)) {
    await Tenant.updateMany({ status: legacy }, { $set: { status: next } });
  }
  await Tenant.updateMany({ source: { $exists: false } }, { $set: { source: "LEGACY", session_epoch: 0, branch_limit: 1 } });
  // Backfill owner contact fields from the Owner user where empty.
  const missing = await Tenant.find({ $or: [{ owner_email: { $exists: false } }, { owner_email: "" }] })
    .select("_id")
    .limit(500)
    .lean();
  for (const t of missing) {
    const owner = await User.findOne({ tenant_id: t._id, role: "Owner" }).select("name email").lean();
    if (owner) await Tenant.updateOne({ _id: t._id }, { $set: { owner_name: owner.name, owner_email: owner.email.toLowerCase() } });
  }
}

// ---------------------------------------------------------------------------
// Duplicate detection (one trial per normalized email / phone / business name)
// ---------------------------------------------------------------------------
export function normalizePhone(p: string) {
  return (p || "").replace(/[^\d]/g, "").replace(/^0092|^92|^0/, "");
}
export function normalizeName(n: string) {
  return (n || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function findDuplicateAgency(input: { email?: string; phone?: string; business_name?: string }, excludeId?: string) {
  const ors: Record<string, unknown>[] = [];
  if (input.email) ors.push({ owner_email: input.email.trim().toLowerCase() }, { contact_email: input.email.trim().toLowerCase() });
  const phone = normalizePhone(input.phone || "");
  if (phone.length >= 7) ors.push({ owner_phone: { $regex: `${phone}$` } }, { contact_phone: { $regex: `${phone}$` } });
  if (!ors.length && !input.business_name) return null;
  const filter: Record<string, unknown> = ors.length ? { $or: ors } : {};
  if (excludeId) filter._id = { $ne: excludeId };
  const byContact = ors.length ? await Tenant.findOne(filter).select("_id name").lean() : null;
  if (byContact) return byContact;
  if (input.business_name) {
    const norm = normalizeName(input.business_name);
    if (norm.length < 3) return null;
    const candidates = await Tenant.find(excludeId ? { _id: { $ne: excludeId } } : {})
      .select("_id name")
      .lean();
    return candidates.find((c) => normalizeName(c.name) === norm) ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Agency creation (trial, or pending purchase without a tenant login)
// ---------------------------------------------------------------------------
export interface NewAgencyInput {
  business_name: string;
  owner_name: string;
  owner_email: string;
  owner_phone?: string;
  business_phone?: string;
  business_email?: string;
  business_address?: string;
  source: ITenant["source"];
  sales_owner_id?: string | null;
  referrer_earner_id?: string | null;
  marketing_consent?: boolean;
  seats?: number;
  branches?: number;
  invoice_prefix?: string;
  base_currency?: string;
  internal_note?: string;
}

/** Creates an agency in TRIAL with an inactive owner who receives a set-password link. */
export async function createTrialAgency(input: NewAgencyInput, session: ClientSession | null) {
  const email = input.owner_email.trim().toLowerCase();
  if (await User.exists({ email })) throw new ApiError(409, "EMAIL_IN_USE", "An account with this email already exists. Please contact us.");
  const trialDays = await getSetting("trial_days");
  const now = new Date();
  const expires = addDays(now, trialDays);
  const [agency] = await Tenant.create(
    [
      {
        name: input.business_name.trim(),
        status: "TRIAL",
        access_expires_at: expires,
        trial_ends_at: expires,
        max_users: input.seats ?? 5,
        branch_limit: input.branches ?? 1,
        contact_person: input.owner_name,
        contact_email: email,
        contact_phone: input.owner_phone || "",
        owner_name: input.owner_name,
        owner_email: email,
        owner_phone: input.owner_phone || "",
        business_phone: input.business_phone || "",
        business_email: input.business_email || "",
        business_address: input.business_address || "",
        address: input.business_address || "",
        source: input.source,
        sales_owner_id: input.sales_owner_id || null,
        referrer_earner_id: input.referrer_earner_id || null,
        marketing_consent: Boolean(input.marketing_consent),
        invoice_prefix: input.invoice_prefix || "INV",
        base_currency: input.base_currency || "PKR",
        internal_note: input.internal_note || null,
      },
    ],
    sessionOpt(session)
  );
  const owner = await provisionOwner(agency, session, "trial");
  return { agency, owner: owner.user, set_password_link: owner.link };
}

/** Creates the agency Owner user (inactive, random password) and queues the set-password email. */
export async function provisionOwner(agency: ITenant, session: ClientSession | null, context: "trial" | "welcome") {
  const email = agency.owner_email.toLowerCase();
  let user = await User.findOne({ email }).session(session);
  if (user && String(user.tenant_id) !== String(agency._id)) {
    throw new ApiError(409, "EMAIL_IN_USE", "The owner email is already used by another account");
  }
  if (!user) {
    const placeholder = await bcrypt.hash(randomToken(24), 10);
    [user] = await User.create(
      [{ tenant_id: agency._id, name: agency.owner_name || agency.name, email, password: placeholder, role: "Owner", is_active: false }],
      sessionOpt(session)
    );
  }
  const link = await sendSetPasswordEmail({ _id: user._id, name: user.name, email: user.email }, context, session);
  return { user, link };
}

export async function recordConsent(
  input: { agency_id: Types.ObjectId | string | null; email: string; data_consent: boolean; marketing_consent: boolean; ip: string | null; user_agent: string | null },
  session: ClientSession | null
) {
  await MarketingConsent.updateOne(
    { email: input.email.trim().toLowerCase() },
    {
      $set: {
        agency_id: input.agency_id,
        data_consent: input.data_consent,
        marketing_consent: input.marketing_consent,
        consent_text_version: "v1",
        captured_at: new Date(),
        ip: input.ip,
        user_agent: input.user_agent,
        unsubscribed_at: null,
      },
    },
    { upsert: true, ...sessionOpt(session) }
  );
}

// ---------------------------------------------------------------------------
// Lifecycle transitions (architecture §5.4). Each runs in a transaction with
// its audit row and queued email.
// ---------------------------------------------------------------------------
async function loadAgency(id: string, session: ClientSession | null) {
  const agency = await Tenant.findById(id).session(session);
  if (!agency) throw new ApiError(404, "NOT_FOUND", "Agency not found");
  return agency;
}

function snapshot(a: ITenant) {
  return {
    status: a.status,
    access_expires_at: a.access_expires_at,
    suspended_at: a.suspended_at,
    resume_status: a.resume_status,
    max_users: a.max_users,
    branch_limit: a.branch_limit,
    sales_owner_id: a.sales_owner_id,
    retention_until: a.retention_until,
  };
}

export async function suspendAgency(ctx: PlatformContext, id: string, reason: string) {
  const result = await withTxn(async (session) => {
    const agency = await loadAgency(id, session);
    const current = getEffectiveStatus(agency);
    if (!["TRIAL", "ACTIVE", "EXPIRED"].includes(current)) {
      throw new ApiError(409, "INVALID_TRANSITION", `Cannot suspend an agency in ${current}`);
    }
    const before = snapshot(agency);
    agency.resume_status = current;
    agency.status = "SUSPENDED";
    agency.suspended_at = new Date();
    agency.suspension_reason = reason;
    agency.session_epoch = (agency.session_epoch ?? 0) + 1;
    await agency.save(sessionOpt(session));
    await writeAudit(platformActor(ctx), { action: "agency.suspend", entity_type: "agency", entity_id: agency._id, agency_id: agency._id, before, after: snapshot(agency), reason }, session);
    const toggles = await getSetting("notification_toggles");
    if (toggles.suspension_email && agency.owner_email) {
      const t = await templates.lifecycle("suspended", agency.name);
      await enqueueEmail({ to: agency.owner_email, ...t, category: "LIFECYCLE", related_type: "agency", related_id: String(agency._id), idempotency_key: `suspend:${agency._id}:${agency.session_epoch}` }, session);
    }
    return agency;
  });
  invalidateAgency(id);
  return result;
}

/** Resume: expiry shifts by the suspended duration only if the clock was running (TRIAL/ACTIVE). */
export async function activateAgency(ctx: PlatformContext, id: string, reason: string | null) {
  const result = await withTxn(async (session) => {
    const agency = await loadAgency(id, session);
    if (normalizeStatus(agency.status) !== "SUSPENDED") throw new ApiError(409, "INVALID_TRANSITION", "Agency is not suspended");
    const before = snapshot(agency);
    const now = new Date();
    const resume = (agency.resume_status as TenantStatus) || "ACTIVE";
    if ((resume === "TRIAL" || resume === "ACTIVE") && agency.suspended_at && agency.access_expires_at) {
      const paused = now.getTime() - new Date(agency.suspended_at).getTime();
      agency.access_expires_at = new Date(new Date(agency.access_expires_at).getTime() + paused);
      if (agency.trial_ends_at && resume === "TRIAL") agency.trial_ends_at = agency.access_expires_at;
    }
    agency.status = resume;
    agency.status = getEffectiveStatus(agency, now);
    agency.suspended_at = null;
    agency.resume_status = null;
    agency.suspension_reason = null;
    await agency.save(sessionOpt(session));
    await writeAudit(platformActor(ctx), { action: "agency.activate", entity_type: "agency", entity_id: agency._id, agency_id: agency._id, before, after: snapshot(agency), reason }, session);
    const toggles = await getSetting("notification_toggles");
    if (toggles.reactivation_email && agency.owner_email) {
      const t = await templates.lifecycle("reactivated", agency.name);
      await enqueueEmail({ to: agency.owner_email, ...t, category: "LIFECYCLE", related_type: "agency", related_id: String(agency._id), idempotency_key: `reactivate:${agency._id}:${now.getTime()}` }, session);
    }
    return agency;
  });
  invalidateAgency(id);
  return result;
}

export async function offboardAgency(
  ctx: PlatformContext,
  id: string,
  input: { offboard_reason: string; retention_months?: number; note?: string; notify?: boolean }
) {
  const result = await withTxn(async (session) => {
    const agency = await loadAgency(id, session);
    const current = getEffectiveStatus(agency);
    if (!["TRIAL", "ACTIVE", "EXPIRED", "SUSPENDED"].includes(current)) {
      throw new ApiError(409, "INVALID_TRANSITION", `Cannot offboard an agency in ${current}`);
    }
    if (!["PAUSED", "LEFT", "NON_PAYMENT", "OTHER"].includes(input.offboard_reason)) {
      throw new ApiError(400, "VALIDATION_ERROR", "offboard_reason must be PAUSED, LEFT, NON_PAYMENT or OTHER");
    }
    const months = input.retention_months && input.retention_months > 0 ? Math.min(120, Math.floor(input.retention_months)) : await getSetting("default_retention_months");
    const before = snapshot(agency);
    const now = new Date();
    const until = new Date(now);
    until.setUTCMonth(until.getUTCMonth() + months);
    agency.status = "OFFBOARDED";
    agency.offboarded_at = now;
    agency.offboard_reason = input.offboard_reason;
    agency.offboard_note = input.note || null;
    agency.retention_months = months;
    agency.retention_until = until;
    agency.session_epoch = (agency.session_epoch ?? 0) + 1;
    await agency.save(sessionOpt(session));
    await writeAudit(platformActor(ctx), { action: "agency.offboard", entity_type: "agency", entity_id: agency._id, agency_id: agency._id, before, after: snapshot(agency), reason: `${input.offboard_reason}${input.note ? `: ${input.note}` : ""}` }, session);
    const toggles = await getSetting("notification_toggles");
    if (toggles.offboard_email && input.notify !== false && agency.owner_email) {
      const t = await templates.lifecycle("offboarded", agency.name);
      await enqueueEmail({ to: agency.owner_email, ...t, category: "LIFECYCLE", related_type: "agency", related_id: String(agency._id), idempotency_key: `offboard:${agency._id}:${agency.session_epoch}` }, session);
    }
    return agency;
  });
  invalidateAgency(id);
  return result;
}

/** Escape hatch: OFFBOARDED → EXPIRED (read-only, can self-export). */
export async function restoreReadOnly(ctx: PlatformContext, id: string, reason: string) {
  const result = await withTxn(async (session) => {
    const agency = await loadAgency(id, session);
    if (normalizeStatus(agency.status) !== "OFFBOARDED") throw new ApiError(409, "INVALID_TRANSITION", "Agency is not offboarded");
    const before = snapshot(agency);
    agency.status = "EXPIRED";
    agency.offboarded_at = null;
    agency.retention_until = null;
    await agency.save(sessionOpt(session));
    await writeAudit(platformActor(ctx), { action: "agency.restore_read_only", entity_type: "agency", entity_id: agency._id, agency_id: agency._id, before, after: snapshot(agency), reason }, session);
    return agency;
  });
  invalidateAgency(id);
  return result;
}

/** Complimentary extension: free days, Super Admin only, reason required. */
export async function extendComplimentary(ctx: PlatformContext, id: string, days: number, reason: string) {
  if (!Number.isFinite(days) || days <= 0 || days > 3650) throw new ApiError(400, "VALIDATION_ERROR", "days must be between 1 and 3650");
  const result = await withTxn(async (session) => {
    const agency = await loadAgency(id, session);
    const current = getEffectiveStatus(agency);
    if (!["TRIAL", "ACTIVE", "EXPIRED"].includes(current)) {
      throw new ApiError(409, "INVALID_TRANSITION", `Cannot extend an agency in ${current}`);
    }
    const before = snapshot(agency);
    const now = new Date();
    const start = agency.access_expires_at && new Date(agency.access_expires_at) > now ? new Date(agency.access_expires_at) : now;
    const end = addDays(start, Math.floor(days));
    await SubscriptionPeriod.create(
      [{ agency_id: agency._id, order_id: null, source: "COMPLIMENTARY", starts_at: start, ends_at: end, seats: agency.max_users, branches: agency.branch_limit ?? 1, limits_applied: true, reason, created_by: ctx.user.id }],
      sessionOpt(session)
    );
    agency.access_expires_at = end;
    if (current === "EXPIRED") agency.status = agency.trial_ends_at && !(await hasApprovedOrder(agency._id, session)) ? "TRIAL" : "ACTIVE";
    else agency.status = current;
    if (agency.status === "TRIAL") agency.trial_ends_at = end;
    await agency.save(sessionOpt(session));
    await writeAudit(platformActor(ctx), { action: "agency.extend_complimentary", entity_type: "agency", entity_id: agency._id, agency_id: agency._id, before, after: { ...snapshot(agency), days }, reason }, session);
    return agency;
  });
  invalidateAgency(id);
  return result;
}

async function hasApprovedOrder(agencyId: Types.ObjectId, session: ClientSession | null) {
  const { Order } = await import("@/models/platform");
  return Boolean(await Order.exists({ agency_id: agencyId, status: "APPROVED" }).session(session));
}

export async function setLimits(ctx: PlatformContext, id: string, seats: number | undefined, branches: number | undefined, reason: string) {
  const result = await withTxn(async (session) => {
    const agency = await loadAgency(id, session);
    const before = snapshot(agency);
    if (seats !== undefined) {
      if (!Number.isInteger(seats) || seats < 1) throw new ApiError(400, "VALIDATION_ERROR", "seats must be a positive integer");
      const activeUsers = await User.countDocuments({ tenant_id: agency._id, is_active: { $ne: false } }).session(session);
      if (seats < activeUsers) throw new ApiError(409, "LIMIT_BELOW_USAGE", `Agency has ${activeUsers} active users — deactivate users first`);
      agency.max_users = seats;
    }
    if (branches !== undefined) {
      if (!Number.isInteger(branches) || branches < 1) throw new ApiError(400, "VALIDATION_ERROR", "branches must be a positive integer");
      agency.branch_limit = branches;
    }
    await agency.save(sessionOpt(session));
    await writeAudit(platformActor(ctx), { action: "agency.set_limits", entity_type: "agency", entity_id: agency._id, agency_id: agency._id, before, after: snapshot(agency), reason }, session);
    return agency;
  });
  invalidateAgency(id);
  return result;
}

export async function assignSalesOwner(ctx: PlatformContext, id: string, ownerId: string | null, reason: string | null) {
  return withTxn(async (session) => {
    const agency = await loadAgency(id, session);
    if (ownerId) {
      const owner = await User.findOne({ _id: ownerId, role: "SalesExecutive" }).session(session).lean();
      if (!owner) throw new ApiError(400, "VALIDATION_ERROR", "Sales owner must be a Sales Executive");
    }
    const before = snapshot(agency);
    agency.sales_owner_id = ownerId ? new Types.ObjectId(ownerId) : null;
    await agency.save(sessionOpt(session));
    // Open tickets follow the new owner.
    const { SupportTicket } = await import("@/models/platform");
    await SupportTicket.updateMany(
      { agency_id: agency._id, status: { $nin: ["CLOSED"] } },
      { $set: { assigned_to_platform_user_id: agency.sales_owner_id } },
      sessionOpt(session)
    );
    await writeAudit(platformActor(ctx), { action: "agency.assign_owner", entity_type: "agency", entity_id: agency._id, agency_id: agency._id, before, after: snapshot(agency), reason }, session);
    return agency;
  });
}
