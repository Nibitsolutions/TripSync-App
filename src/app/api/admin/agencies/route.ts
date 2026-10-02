import { NextRequest, NextResponse } from "next/server";
import User from "@/models/User";
import { withPlatform, pagination, listResponse, readJson, ApiError, toCsv, csvResponse, rateLimit } from "@/lib/platform/http";
import { agencyFilterFromUrl, listAgencies, AGENCY_SORTS } from "@/lib/platform/agency-query";
import { createTrialAgency, findDuplicateAgency } from "@/lib/platform/lifecycle";
import { formatPKT, withTxn } from "@/lib/platform/db";
import { platformActor, writeAudit } from "@/lib/platform/audit";

// GET /api/admin/agencies - Server-side search, filters and pagination (?format=csv to export)
export async function GET(req: NextRequest) {
  return withPlatform(req, "agencies.read", async (ctx) => {
    const url = new URL(req.url);
    const filter = agencyFilterFromUrl(url, ctx.user);
    const sort = AGENCY_SORTS[url.searchParams.get("sort") || ""] ?? AGENCY_SORTS.created_desc;
    if (url.searchParams.get("format") === "csv") {
      const { rows } = await listAgencies(filter, sort, 0, 10_000);
      const csv = toCsv(
        rows.map((r) => ({
          ...r,
          owner_name: r.owner.name,
          owner_email: r.owner.email,
          owner_phone: r.owner.phone,
          access_expires_at: formatPKT(r.access_expires_at),
          created_at: formatPKT(r.created_at),
        })),
        ["name", "email", "owner_name", "owner_email", "owner_phone", "status", "source", "access_expires_at", "days_left", "user_count", "seat_limit", "branch_limit", "sales_owner_name", "marketing_consent", "created_at"]
      );
      return csvResponse("agencies.csv", csv);
    }
    const { page, page_size, skip } = pagination(url);
    const { rows, total } = await listAgencies(filter, sort, skip, page_size);
    return listResponse(rows, page, page_size, total);
  });
}

// POST /api/admin/agencies - Create a 7-day trial (paid onboarding goes through Orders)
export async function POST(req: NextRequest) {
  return withPlatform(req, "agencies.create_trial", async (ctx) => {
    rateLimit(`trial-create:${ctx.user.id}`, 60, 3_600_000);
    const body = await readJson<Record<string, string>>(req);
    const business_name = (body.business_name || body.agency_name || "").trim();
    const owner_name = (body.owner_name || "").trim();
    const owner_email = (body.owner_email || "").trim().toLowerCase();
    if (!business_name || !owner_name || !owner_email) throw new ApiError(400, "VALIDATION_ERROR", "Business name, owner name and owner email are required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(owner_email)) throw new ApiError(400, "VALIDATION_ERROR", "Invalid owner email");
    if (await User.exists({ email: owner_email })) throw new ApiError(409, "EMAIL_IN_USE", "This email is already used by another account");

    const dup = await findDuplicateAgency({ email: owner_email, phone: body.owner_phone, business_name });
    if (dup) {
      await writeAudit(platformActor(ctx), { action: "agency.trial_duplicate_rejected", entity_type: "agency", entity_id: dup._id, agency_id: dup._id, after: { business_name, owner_email } });
      throw new ApiError(409, "DUPLICATE_TRIAL", `A matching agency already exists (${dup.name}). One trial per business.`);
    }

    const isSales = ctx.user.role === "SalesExecutive";
    const result = await withTxn(async (session) => {
      const created = await createTrialAgency(
        {
          business_name,
          owner_name,
          owner_email,
          owner_phone: body.owner_phone,
          business_phone: body.business_phone,
          business_email: body.business_email,
          business_address: body.business_address,
          source: isSales ? "SALES_EXEC" : "ADMIN_CREATED",
          sales_owner_id: isSales ? ctx.user.id : body.sales_owner_id || null,
          invoice_prefix: body.invoice_prefix,
          base_currency: body.base_currency,
          internal_note: body.internal_note,
        },
        session
      );
      await writeAudit(platformActor(ctx), { action: "agency.create_trial", entity_type: "agency", entity_id: created.agency._id, agency_id: created.agency._id, after: created.agency.toObject() }, session);
      return created;
    });
    return NextResponse.json(
      { agency: result.agency, owner: { id: result.owner._id, name: result.owner.name, email: result.owner.email }, set_password_link: result.set_password_link },
      { status: 201 }
    );
  });
}
