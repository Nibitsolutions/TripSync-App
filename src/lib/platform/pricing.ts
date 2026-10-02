import { ClientSession, Types } from "mongoose";
import { ITenant } from "@/models/Tenant";
import { Campaign, ICampaign, IPriceBook, IPromoCode, Order, OrderType, PriceBook, PromoCode } from "@/models/platform";
import { ApiError } from "./http";
import { DAY_MS, roundHalfUp } from "./db";
import { getEffectiveStatus } from "./lifecycle";
import { getSetting } from "./settings";

// One pricing engine for every quote (architecture §7.4, A3). The client only
// displays the returned breakdown; this is the price honoured at approval.

export interface QuoteInput {
  type: OrderType;
  agency?: Pick<ITenant, "_id" | "max_users" | "branch_limit" | "access_expires_at" | "status"> | null;
  seats: number;
  branches: number;
  term_quarters: number;
  promo_code?: string | null;
  manual_adjustment?: number;
  now?: Date;
}

export interface QuoteLine {
  label: string;
  amount: number;
}

export interface Quote {
  type: OrderType;
  price_book_id: string;
  currency: string;
  seats: number;
  branches: number;
  term_quarters: number;
  months: number;
  monthly_price: number;
  current_monthly_price: number | null;
  remaining_days: number | null;
  list_price: number;
  campaign: { id: string; name: string; discount_type: string; value: number; discount: number } | null;
  campaign_discount: number;
  subtotal_1: number;
  promo: { id: string; code: string; discount_type: string; value: number; discount: number; owner_earner_id: string | null } | null;
  promo_error: string | null;
  promo_discount: number;
  subtotal_2: number;
  manual_adjustment: number;
  tax_rate_percent: number;
  tax_amount: number;
  total_due: number;
  lines: QuoteLine[];
}

export async function activePriceBook(now = new Date(), session: ClientSession | null = null): Promise<IPriceBook> {
  const pb = await PriceBook.findOne({ effective_from: { $lte: now } })
    .sort({ effective_from: -1, created_at: -1 })
    .session(session)
    .lean<IPriceBook>();
  if (!pb) throw new ApiError(409, "NO_PRICE_BOOK", "No active price book. Create one in Pricing & Promotions first.");
  return pb;
}

export function monthlyPrice(pb: IPriceBook, seats: number, branches: number) {
  return (
    pb.base_monthly_fee +
    pb.seat_monthly_rate * Math.max(0, seats - pb.included_seats) +
    pb.branch_monthly_rate * Math.max(0, branches - pb.included_branches)
  );
}

function discountFor(type: "PERCENT" | "FLAT", value: number, base: number) {
  if (base <= 0) return 0;
  return type === "PERCENT" ? Math.min(base, roundHalfUp((base * value) / 100)) : Math.min(roundHalfUp(value), base);
}

export function campaignState(c: Pick<ICampaign, "is_disabled" | "starts_at" | "ends_at">, now = new Date()) {
  if (c.is_disabled) return "DISABLED";
  if (new Date(c.starts_at) > now) return "SCHEDULED";
  if (c.ends_at && new Date(c.ends_at) <= now) return "EXPIRED";
  return "ACTIVE";
}

/** Validates a promo code for an agency; returns the code or an error message. */
export async function validatePromo(
  code: string,
  agencyId: Types.ObjectId | string | null,
  now: Date,
  excludeOrderId?: Types.ObjectId | string | null
): Promise<{ promo: IPromoCode | null; error: string | null }> {
  const clean = code.trim().toUpperCase();
  if (!clean) return { promo: null, error: null };
  const promo = await PromoCode.findOne({ code: clean }).lean<IPromoCode>();
  if (!promo) return { promo: null, error: "Promo code not found" };
  const state = campaignState(promo, now);
  if (state === "DISABLED") return { promo: null, error: "This promo code is no longer active" };
  if (state === "SCHEDULED") return { promo: null, error: "This promo code is not active yet" };
  if (state === "EXPIRED") return { promo: null, error: "This promo code has expired" };

  const exclude = excludeOrderId ? { _id: { $ne: excludeOrderId } } : {};
  if (promo.max_redemptions !== null && promo.max_redemptions !== undefined) {
    const used = await Order.countDocuments({ promo_code_id: promo._id, status: { $in: ["PENDING", "APPROVED"] }, ...exclude });
    if (used >= promo.max_redemptions) return { promo: null, error: "This promo code has reached its usage limit" };
  }
  if (agencyId) {
    if (promo.one_per_agency) {
      const usedByAgency = await Order.exists({ promo_code_id: promo._id, agency_id: agencyId, status: { $in: ["PENDING", "APPROVED"] }, ...exclude });
      if (usedByAgency) return { promo: null, error: "This promo code was already used by your agency" };
    }
    if (promo.first_order_only) {
      const paid = await Order.exists({ agency_id: agencyId, status: "APPROVED", ...exclude });
      if (paid) return { promo: null, error: "This promo code is valid on the first order only" };
    }
  }
  return { promo, error: null };
}

/** Picks the order type for an existing agency. */
export async function orderTypeFor(agency: Pick<ITenant, "_id" | "status" | "access_expires_at">, wantsUpgrade: boolean): Promise<OrderType> {
  const s = getEffectiveStatus(agency);
  if (s === "PENDING" || s === "REJECTED") return "NEW";
  if (s === "OFFBOARDED") return "REACTIVATION";
  if (s === "TRIAL") return "CONVERSION";
  if (s === "ACTIVE") return wantsUpgrade ? "UPGRADE" : "RENEWAL";
  if (s === "EXPIRED") return (await Order.exists({ agency_id: agency._id, status: "APPROVED" })) ? "RENEWAL" : "CONVERSION";
  throw new ApiError(409, "INVALID_STATE", `Orders cannot be placed for an agency in ${s}`);
}

export async function quote(input: QuoteInput): Promise<Quote> {
  const now = input.now ?? new Date();
  const seats = Math.floor(Number(input.seats));
  const branches = Math.floor(Number(input.branches));
  if (!Number.isFinite(seats) || seats < 1 || seats > 10_000) throw new ApiError(400, "VALIDATION_ERROR", "seats must be at least 1");
  if (!Number.isFinite(branches) || branches < 1 || branches > 1_000) throw new ApiError(400, "VALIDATION_ERROR", "branches must be at least 1");

  const pb = await activePriceBook(now);
  const lines: QuoteLine[] = [];
  let months = 0;
  let termQuarters = 0;
  let listPrice: number;
  let monthly = monthlyPrice(pb, seats, branches);
  let currentMonthly: number | null = null;
  let remainingDays: number | null = null;

  if (input.type === "UPGRADE") {
    const agency = input.agency;
    if (!agency || !agency.access_expires_at) throw new ApiError(400, "VALIDATION_ERROR", "Upgrade requires an active subscription");
    const curSeats = agency.max_users ?? 0;
    const curBranches = agency.branch_limit ?? 1;
    if (seats < curSeats || branches < curBranches) {
      throw new ApiError(400, "VALIDATION_ERROR", "Mid-term decreases are not allowed — reduce limits at renewal");
    }
    if (seats === curSeats && branches === curBranches) throw new ApiError(400, "VALIDATION_ERROR", "Upgrade must increase seats or branches");
    currentMonthly = monthlyPrice(pb, curSeats, curBranches);
    remainingDays = Math.max(0, Math.ceil((new Date(agency.access_expires_at).getTime() - now.getTime()) / DAY_MS));
    listPrice = roundHalfUp(((monthly - currentMonthly) * remainingDays) / 30);
    lines.push({ label: `Upgrade to ${seats} seats / ${branches} branches — ${remainingDays} days prorated`, amount: listPrice });
  } else {
    termQuarters = Math.floor(Number(input.term_quarters));
    const allowed = pb.term_options?.length ? pb.term_options : [1, 2, 3, 4];
    if (!allowed.includes(termQuarters)) throw new ApiError(400, "VALIDATION_ERROR", `term_quarters must be one of ${allowed.join(", ")}`);
    months = termQuarters * 3;
    monthly = roundHalfUp(monthly);
    listPrice = monthly * months;
    lines.push({ label: `${seats} seats, ${branches} branch${branches > 1 ? "es" : ""} × ${months} months @ ${monthly.toLocaleString("en-PK")}/month`, amount: listPrice });
  }

  // 1) Campaign — the single eligible campaign giving the largest discount.
  const campaigns = await Campaign.find({
    is_disabled: false,
    starts_at: { $lte: now },
    $or: [{ ends_at: null }, { ends_at: { $gt: now } }],
    applies_to_order_types: input.type,
  }).lean<ICampaign[]>();
  let best: { c: ICampaign; d: number } | null = null;
  for (const c of campaigns) {
    const d = discountFor(c.discount_type, c.value, listPrice);
    if (!best || d > best.d) best = { c, d };
  }
  const campaignDiscount = best?.d ?? 0;
  const subtotal1 = listPrice - campaignDiscount;
  if (best && campaignDiscount > 0) lines.push({ label: `Campaign: ${best.c.name}`, amount: -campaignDiscount });

  // 2) Promo code — applied to the campaign-discounted subtotal (sequential stacking).
  let promoDiscount = 0;
  let promoOut: Quote["promo"] = null;
  let promoError: string | null = null;
  if (input.promo_code && input.promo_code.trim()) {
    const { promo, error } = await validatePromo(input.promo_code, input.agency?._id ?? null, now);
    if (error) promoError = error;
    if (promo) {
      promoDiscount = discountFor(promo.discount_type, promo.value, subtotal1);
      promoOut = {
        id: String(promo._id),
        code: promo.code,
        discount_type: promo.discount_type,
        value: promo.value,
        discount: promoDiscount,
        owner_earner_id: promo.owner_earner_id ? String(promo.owner_earner_id) : null,
      };
      if (promoDiscount > 0) lines.push({ label: `Promo code ${promo.code}`, amount: -promoDiscount });
    }
  }
  const subtotal2 = subtotal1 - promoDiscount;

  // 3) Manual adjustment (Super Admin, with reason — enforced by the caller).
  const adjustment = roundHalfUp(Number(input.manual_adjustment) || 0);
  if (adjustment) lines.push({ label: "Adjustment", amount: adjustment });
  const afterAdjust = Math.max(0, subtotal2 + adjustment);

  // 4) Tax if enabled.
  const tax = await getSetting("receipt_tax");
  const taxRate = tax.enabled ? Number(tax.rate_percent) || 0 : 0;
  const taxAmount = taxRate ? roundHalfUp((afterAdjust * taxRate) / 100) : 0;
  if (taxAmount) lines.push({ label: `Tax (${taxRate}%)`, amount: taxAmount });

  return {
    type: input.type,
    price_book_id: String(pb._id),
    currency: pb.currency || "PKR",
    seats,
    branches,
    term_quarters: termQuarters,
    months,
    monthly_price: monthly,
    current_monthly_price: currentMonthly,
    remaining_days: remainingDays,
    list_price: listPrice,
    campaign: best && campaignDiscount > 0 ? { id: String(best.c._id), name: best.c.name, discount_type: best.c.discount_type, value: best.c.value, discount: campaignDiscount } : null,
    campaign_discount: campaignDiscount,
    subtotal_1: subtotal1,
    promo: promoOut,
    promo_error: promoError,
    promo_discount: promoDiscount,
    subtotal_2: subtotal2,
    manual_adjustment: adjustment,
    tax_rate_percent: taxRate,
    tax_amount: taxAmount,
    total_due: Math.max(0, afterAdjust + taxAmount),
    lines,
  };
}
