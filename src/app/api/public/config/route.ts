import { NextResponse } from "next/server";
import { Campaign } from "@/models/platform";
import { withErrors } from "@/lib/platform/http";
import { getSetting } from "@/lib/platform/settings";
import { activePriceBook } from "@/lib/platform/pricing";

// GET /api/public/config - Support contacts, payment details, trial days, terms, active campaign banner
export async function GET() {
  return withErrors(async () => {
    const now = new Date();
    const [support, payment, trialDays, pb, campaign] = await Promise.all([
      getSetting("support_contact"),
      getSetting("payment_instructions"),
      getSetting("trial_days"),
      activePriceBook(now).catch(() => null),
      Campaign.findOne({ is_disabled: false, starts_at: { $lte: now }, $or: [{ ends_at: null }, { ends_at: { $gt: now } }], applies_to_order_types: "NEW" }).sort({ value: -1 }).lean(),
    ]);
    return NextResponse.json(
      {
        support_contact: support,
        payment_instructions: payment,
        trial_days: trialDays,
        term_options: pb?.term_options ?? [1, 2, 3, 4],
        pricing: pb ? { base_monthly_fee: pb.base_monthly_fee, included_seats: pb.included_seats, included_branches: pb.included_branches, seat_monthly_rate: pb.seat_monthly_rate, branch_monthly_rate: pb.branch_monthly_rate, currency: pb.currency } : null,
        campaign: campaign ? { name: campaign.name, description: campaign.description, discount_type: campaign.discount_type, value: campaign.value, ends_at: campaign.ends_at } : null,
      },
      { headers: { "Cache-Control": "public, max-age=60" } }
    );
  });
}
