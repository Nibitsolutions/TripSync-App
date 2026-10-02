import { NextResponse } from "next/server";
import { CommissionEarner, PromoCode } from "@/models/platform";
import { withErrors, readJson, requestMeta, ApiError } from "@/lib/platform/http";
import { createTrialAgency, findDuplicateAgency, recordConsent } from "@/lib/platform/lifecycle";
import { withTxn } from "@/lib/platform/db";
import { writeAudit } from "@/lib/platform/audit";
import { assertDeliverableEmail, guardPublicForm } from "@/lib/platform/public";

// POST /api/public/trials - Self-serve 7-day trial with consent capture
export async function POST(req: Request) {
  return withErrors(async () => {
    const meta = requestMeta(req);
    const b = await readJson<Record<string, unknown>>(req);
    await guardPublicForm(meta, b, "trial");
    const owner_name = String(b.owner_name || "").trim();
    const business_name = String(b.business_name || "").trim();
    const phone = String(b.phone || "").trim();
    if (!owner_name || !business_name || !phone) throw new ApiError(400, "VALIDATION_ERROR", "Name, phone and business name are required");
    if (b.data_consent !== true) throw new ApiError(400, "CONSENT_REQUIRED", "Please accept the data processing terms to continue");
    const email = await assertDeliverableEmail(String(b.email || ""));

    const dup = await findDuplicateAgency({ email, phone, business_name });
    if (dup) {
      await writeAudit({ kind: "public", meta }, { action: "agency.trial_duplicate_rejected", entity_type: "agency", entity_id: dup._id, agency_id: dup._id, after: { business_name, email } });
      throw new ApiError(409, "DUPLICATE_TRIAL", "It looks like you already have a TripSync account or trial. Please contact us and we'll help you right away.");
    }

    // A referral/promo code on signup attributes the trial to that earner.
    let referrer: string | null = null;
    let salesOwner: string | null = null;
    const code = String(b.ref || b.promo_code || "").trim().toUpperCase();
    if (code) {
      const promo = await PromoCode.findOne({ code }).select("owner_earner_id").lean();
      if (promo?.owner_earner_id) {
        referrer = String(promo.owner_earner_id);
        const earner = await CommissionEarner.findById(promo.owner_earner_id).lean();
        if (earner?.type === "SALES_EXECUTIVE" && earner.platform_user_id) salesOwner = String(earner.platform_user_id);
      }
    }

    await withTxn(async (session) => {
      const { agency } = await createTrialAgency(
        { business_name, owner_name, owner_email: email, owner_phone: phone, source: "PUBLIC_TRIAL", marketing_consent: b.marketing_consent === true, referrer_earner_id: referrer, sales_owner_id: salesOwner },
        session
      );
      await recordConsent({ agency_id: agency._id, email, data_consent: true, marketing_consent: b.marketing_consent === true, ip: meta.ip, user_agent: meta.user_agent }, session);
      await writeAudit({ kind: "public", meta }, { action: "agency.create_trial", entity_type: "agency", entity_id: agency._id, agency_id: agency._id, after: { business_name, email, source: "PUBLIC_TRIAL" } }, session);
    });
    // The set-password link is only emailed (it doubles as email verification).
    return NextResponse.json({ ok: true, message: "Check your email for a link to set your password and start your trial." }, { status: 201 });
  });
}
