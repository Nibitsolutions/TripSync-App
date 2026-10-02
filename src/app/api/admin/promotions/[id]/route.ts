import { NextRequest, NextResponse } from "next/server";
import { Campaign, PromoCode } from "@/models/platform";
import { withPlatform, readJson, ApiError, oid } from "@/lib/platform/http";
import { campaignState } from "@/lib/platform/pricing";
import { platformActor, writeAudit } from "@/lib/platform/audit";

// PATCH /api/admin/promotions/[id] - Edit or disable/enable a campaign or promo code.
// After start only `ends_at`, `is_disabled` (and max_redemptions for codes) may change.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withPlatform(req, "pricing.write", async (ctx) => {
    const { id } = await params;
    const b = await readJson<Record<string, unknown>>(req);
    const doc = (await Campaign.findById(oid(id))) ?? (await PromoCode.findById(oid(id)));
    if (!doc) throw new ApiError(404, "NOT_FOUND", "Promotion not found");
    const isCampaign = doc.collection.collectionName === "platform_campaigns";
    const started = campaignState(doc) !== "SCHEDULED";
    const before = doc.toObject();
    const target = doc as unknown as Record<string, unknown>;

    const always = ["ends_at", "is_disabled", ...(isCampaign ? [] : ["max_redemptions"])];
    const beforeStart = isCampaign
      ? ["name", "description", "discount_type", "value", "applies_to_order_types", "starts_at"]
      : ["discount_type", "value", "first_order_only", "one_per_agency", "starts_at", "owner_earner_id"];
    for (const key of [...always, ...beforeStart]) {
      if (b[key] === undefined) continue;
      if (!always.includes(key) && started) throw new ApiError(409, "LOCKED", `Only end date and disable can change after a promotion has started (${key})`);
      let v = b[key];
      if (key === "ends_at" || key === "starts_at") v = v ? new Date(String(v)) : null;
      if (key === "max_redemptions") v = v ? Math.max(1, Math.floor(Number(v))) : null;
      target[key] = v;
    }
    if (target.ends_at && target.starts_at && new Date(target.ends_at as Date) <= new Date(target.starts_at as Date)) {
      throw new ApiError(400, "VALIDATION_ERROR", "End must be after start");
    }
    await doc.save();
    await writeAudit(platformActor(ctx), {
      action: b.is_disabled === true ? `pricing.${isCampaign ? "campaign" : "promo"}_disable` : `pricing.${isCampaign ? "campaign" : "promo"}_edit`,
      entity_type: isCampaign ? "campaign" : "promo_code",
      entity_id: doc._id,
      before,
      after: doc.toObject(),
    });
    return NextResponse.json({ promotion: doc });
  });
}
