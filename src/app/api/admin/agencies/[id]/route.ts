import { NextRequest, NextResponse } from "next/server";
import Tenant from "@/models/Tenant";
import User from "@/models/User";
import { Order, Receipt, SubscriptionPeriod, SupportTicket, PlatformAuditLog, MarketingConsent, CommissionEarner, TenantArchive } from "@/models/platform";
import { withPlatform, assertAgencyInScope, readJson, oid, ApiError } from "@/lib/platform/http";
import { serializeAgencies } from "@/lib/platform/agency-query";
import { platformActor, writeAudit } from "@/lib/platform/audit";
import { invalidateAgency } from "@/lib/platform/lifecycle";

// GET /api/admin/agencies/[id] - Account-level detail only (never the agency's business data)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withPlatform(req, "agencies.read", async (ctx) => {
    const { id } = await params;
    const _id = oid(id);
    await assertAgencyInScope(ctx.user, _id);
    const agency = await Tenant.findById(_id).lean();
    if (!agency) throw new ApiError(404, "NOT_FOUND", "Agency not found");
    const [[row], users, periods, orders, receipts, tickets, timeline, consent, referrer, archives] = await Promise.all([
      serializeAgencies([agency]),
      User.find({ tenant_id: _id }).select("name email role is_active last_login_at created_at").sort({ created_at: 1 }).lean(),
      SubscriptionPeriod.find({ agency_id: _id }).sort({ starts_at: -1 }).limit(50).lean(),
      Order.find({ agency_id: _id }).sort({ created_at: -1 }).limit(50).lean(),
      Receipt.find({ agency_id: _id }).sort({ issued_at: -1 }).limit(50).lean(),
      SupportTicket.find({ agency_id: _id }).sort({ last_message_at: -1 }).limit(50).lean(),
      PlatformAuditLog.find({ agency_id: _id }).sort({ occurred_at: -1 }).limit(100).lean(),
      MarketingConsent.findOne({ $or: [{ agency_id: _id }, { email: agency.owner_email || "__none__" }] }).lean(),
      agency.referrer_earner_id ? CommissionEarner.findById(agency.referrer_earner_id).select("name type").lean() : null,
      ctx.user.role === "SalesExecutive" ? [] : TenantArchive.find({ agency_id: _id }).sort({ created_at: -1 }).lean(),
    ]);
    return NextResponse.json({
      agency: {
        ...row,
        business_phone: agency.business_phone,
        business_email: agency.business_email,
        business_address: agency.business_address || agency.address,
        contact_person: agency.contact_person,
        contact_email: agency.contact_email,
        contact_phone: agency.contact_phone,
        base_currency: agency.base_currency,
        invoice_prefix: agency.invoice_prefix,
        trial_ends_at: agency.trial_ends_at,
        suspended_at: agency.suspended_at,
        suspension_reason: agency.suspension_reason,
        resume_status: agency.resume_status,
        offboard_note: agency.offboard_note,
        retention_months: agency.retention_months,
        internal_note: agency.internal_note,
        notes: agency.notes,
        referrer: referrer ? { id: String(referrer._id), name: referrer.name, type: referrer.type } : null,
      },
      users,
      periods,
      orders,
      receipts,
      tickets,
      timeline,
      consent,
      archives,
    });
  });
}

// PATCH /api/admin/agencies/[id] - Edit profile, contacts and note (limits via /set-limits)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withPlatform(req, "agencies.edit_profile", async (ctx) => {
    const { id } = await params;
    const body = await readJson<Record<string, unknown>>(req);
    const agency = await Tenant.findById(oid(id));
    if (!agency) throw new ApiError(404, "NOT_FOUND", "Agency not found");
    const allowed = ["name", "owner_name", "owner_email", "owner_phone", "business_phone", "business_email", "business_address", "contact_person", "contact_email", "contact_phone", "internal_note", "notes", "invoice_prefix", "base_currency"];
    const doc = agency as unknown as Record<string, unknown>;
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] === undefined) continue;
      const value = typeof body[key] === "string" ? (body[key] as string).trim() : body[key];
      if (key === "name" && !value) throw new ApiError(400, "VALIDATION_ERROR", "Name is required");
      before[key] = doc[key];
      doc[key] = key === "owner_email" ? String(value).toLowerCase() : value;
      after[key] = doc[key];
    }
    await agency.save();
    invalidateAgency(id);
    await writeAudit(platformActor(ctx), { action: "agency.edit", entity_type: "agency", entity_id: agency._id, agency_id: agency._id, before, after, reason: typeof body.reason === "string" ? body.reason : null });
    return NextResponse.json({ agency });
  });
}
