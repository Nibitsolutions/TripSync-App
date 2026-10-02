import mongoose, { Schema, Types } from "mongoose";

// ---------------------------------------------------------------------------
// Pricing (architecture §9.3)
// ---------------------------------------------------------------------------
export interface IPriceBook {
  _id: Types.ObjectId;
  name: string;
  effective_from: Date;
  currency: string;
  base_monthly_fee: number;
  included_seats: number;
  included_branches: number;
  seat_monthly_rate: number;
  branch_monthly_rate: number;
  term_options: number[];
  note: string;
  created_by: Types.ObjectId | null;
  created_at: Date;
}

const PriceBookSchema = new Schema<IPriceBook>(
  {
    name: { type: String, required: true },
    effective_from: { type: Date, required: true },
    currency: { type: String, default: "PKR" },
    base_monthly_fee: { type: Number, required: true, min: 0 },
    included_seats: { type: Number, required: true, min: 0 },
    included_branches: { type: Number, required: true, min: 0 },
    seat_monthly_rate: { type: Number, required: true, min: 0 },
    branch_monthly_rate: { type: Number, required: true, min: 0 },
    term_options: { type: [Number], default: [1, 2, 3, 4] },
    note: { type: String, default: "" },
    created_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { collection: "platform_price_books", timestamps: { createdAt: "created_at", updatedAt: false } }
);
PriceBookSchema.index({ effective_from: -1 });
// Price books are immutable: a price change is a new row.
for (const op of ["updateOne", "updateMany", "findOneAndUpdate", "deleteOne", "deleteMany"] as const) {
  PriceBookSchema.pre(op as "updateOne", function () {
    throw new Error("Price books are immutable — insert a new price book instead");
  });
}

export const PriceBook =
  (mongoose.models.PriceBook as mongoose.Model<IPriceBook>) || mongoose.model<IPriceBook>("PriceBook", PriceBookSchema);

export const ORDER_TYPES = ["NEW", "CONVERSION", "RENEWAL", "UPGRADE", "REACTIVATION"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export interface ICampaign {
  _id: Types.ObjectId;
  name: string;
  description: string;
  discount_type: "PERCENT" | "FLAT";
  value: number;
  applies_to_order_types: OrderType[];
  starts_at: Date;
  ends_at: Date | null;
  is_disabled: boolean;
  created_by: Types.ObjectId | null;
  created_at: Date;
  updated_at: Date;
}

const CampaignSchema = new Schema<ICampaign>(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    discount_type: { type: String, enum: ["PERCENT", "FLAT"], required: true },
    value: { type: Number, required: true, min: 0 },
    applies_to_order_types: { type: [String], default: ["NEW", "CONVERSION", "RENEWAL", "REACTIVATION"] },
    starts_at: { type: Date, required: true },
    ends_at: { type: Date, default: null },
    is_disabled: { type: Boolean, default: false },
    created_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { collection: "platform_campaigns", timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);
CampaignSchema.index({ starts_at: 1, ends_at: 1 });

export const Campaign =
  (mongoose.models.Campaign as mongoose.Model<ICampaign>) || mongoose.model<ICampaign>("Campaign", CampaignSchema);

export interface IPromoCode {
  _id: Types.ObjectId;
  code: string;
  owner_earner_id: Types.ObjectId | null;
  discount_type: "PERCENT" | "FLAT";
  value: number;
  first_order_only: boolean;
  starts_at: Date;
  ends_at: Date | null;
  max_redemptions: number | null;
  one_per_agency: boolean;
  is_disabled: boolean;
  created_by: Types.ObjectId | null;
  created_at: Date;
  updated_at: Date;
}

const PromoCodeSchema = new Schema<IPromoCode>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, match: /^[A-Z0-9]{4,20}$/ },
    owner_earner_id: { type: Schema.Types.ObjectId, ref: "CommissionEarner", default: null },
    discount_type: { type: String, enum: ["PERCENT", "FLAT"], required: true },
    value: { type: Number, required: true, min: 0 },
    first_order_only: { type: Boolean, default: false },
    starts_at: { type: Date, required: true },
    ends_at: { type: Date, default: null },
    max_redemptions: { type: Number, default: null },
    one_per_agency: { type: Boolean, default: true },
    is_disabled: { type: Boolean, default: false },
    created_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { collection: "platform_promo_codes", timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);
PromoCodeSchema.index({ owner_earner_id: 1 });

export const PromoCode =
  (mongoose.models.PromoCode as mongoose.Model<IPromoCode>) || mongoose.model<IPromoCode>("PromoCode", PromoCodeSchema);

// ---------------------------------------------------------------------------
// Orders, subscription periods, receipts (architecture §9.4)
// ---------------------------------------------------------------------------
export const ORDER_STATUSES = ["PENDING", "APPROVED", "REJECTED", "REVERSED", "CANCELLED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface IOrder {
  _id: Types.ObjectId;
  order_number: string;
  payment_reference: string;
  agency_id: Types.ObjectId;
  type: OrderType;
  status: OrderStatus;
  source: "PUBLIC_FORM" | "AGENCY_APP" | "ADMIN_PANEL";
  term_quarters: number;
  months: number;
  seats: number;
  branches: number;
  price_book_id: Types.ObjectId;
  monthly_price: number;
  list_price: number;
  campaign_id: Types.ObjectId | null;
  campaign_discount: number;
  promo_code_id: Types.ObjectId | null;
  promo_code: string | null;
  promo_discount: number;
  manual_adjustment: number;
  adjustment_reason: string | null;
  tax_amount: number;
  total_due: number;
  remaining_days: number | null;
  payment_method: "BANK_TRANSFER" | "CASH";
  amount_received: number;
  amount_override_reason: string | null;
  collected_by_platform_user_id: Types.ObjectId | null;
  collected_at: Date | null;
  payment_note: string;
  submitted_by_platform_user_id: Types.ObjectId | null;
  submitted_by_agency_user_id: Types.ObjectId | null;
  possible_duplicate: boolean;
  approved_by: Types.ObjectId | null;
  approved_at: Date | null;
  rejected_by: Types.ObjectId | null;
  rejected_at: Date | null;
  reject_reason: string | null;
  reversed_by: Types.ObjectId | null;
  reversed_at: Date | null;
  reverse_reason: string | null;
  cancelled_at: Date | null;
  commission_earner_id: Types.ObjectId | null;
  receipt_email_status: "PENDING" | "SENT" | "FAILED" | null;
  lines: IReceiptLine[];
  previous_seats: number | null;
  previous_branches: number | null;
  owner_email: string;
  created_at: Date;
  updated_at: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    order_number: { type: String, required: true, unique: true },
    payment_reference: { type: String, required: true, unique: true },
    agency_id: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    type: { type: String, enum: ORDER_TYPES, required: true },
    status: { type: String, enum: ORDER_STATUSES, default: "PENDING" },
    source: { type: String, enum: ["PUBLIC_FORM", "AGENCY_APP", "ADMIN_PANEL"], required: true },
    term_quarters: { type: Number, default: 0 },
    months: { type: Number, default: 0 },
    seats: { type: Number, required: true },
    branches: { type: Number, required: true },
    price_book_id: { type: Schema.Types.ObjectId, ref: "PriceBook", required: true },
    monthly_price: { type: Number, default: 0 },
    list_price: { type: Number, default: 0 },
    campaign_id: { type: Schema.Types.ObjectId, ref: "Campaign", default: null },
    campaign_discount: { type: Number, default: 0 },
    promo_code_id: { type: Schema.Types.ObjectId, ref: "PromoCode", default: null },
    promo_code: { type: String, default: null },
    promo_discount: { type: Number, default: 0 },
    manual_adjustment: { type: Number, default: 0 },
    adjustment_reason: { type: String, default: null },
    tax_amount: { type: Number, default: 0 },
    total_due: { type: Number, required: true },
    remaining_days: { type: Number, default: null },
    payment_method: { type: String, enum: ["BANK_TRANSFER", "CASH"], default: "BANK_TRANSFER" },
    amount_received: { type: Number, default: 0 },
    amount_override_reason: { type: String, default: null },
    collected_by_platform_user_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
    collected_at: { type: Date, default: null },
    payment_note: { type: String, default: "" },
    submitted_by_platform_user_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
    submitted_by_agency_user_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
    possible_duplicate: { type: Boolean, default: false },
    approved_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    approved_at: { type: Date, default: null },
    rejected_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    rejected_at: { type: Date, default: null },
    reject_reason: { type: String, default: null },
    reversed_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reversed_at: { type: Date, default: null },
    reverse_reason: { type: String, default: null },
    cancelled_at: { type: Date, default: null },
    commission_earner_id: { type: Schema.Types.ObjectId, ref: "CommissionEarner", default: null },
    receipt_email_status: { type: String, enum: ["PENDING", "SENT", "FAILED", null], default: null },
    lines: { type: [{ label: String, amount: Number, _id: false }], default: [] },
    previous_seats: { type: Number, default: null },
    previous_branches: { type: Number, default: null },
    owner_email: { type: String, default: "" },
  },
  { collection: "platform_orders", timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);
OrderSchema.index({ status: 1, created_at: 1 });
OrderSchema.index({ agency_id: 1, created_at: -1 });
OrderSchema.index({ promo_code_id: 1, status: 1 });
OrderSchema.index({ approved_at: 1 });

export const Order =
  (mongoose.models.PlatformOrder as mongoose.Model<IOrder>) || mongoose.model<IOrder>("PlatformOrder", OrderSchema);

export interface ISubscriptionPeriod {
  _id: Types.ObjectId;
  agency_id: Types.ObjectId;
  order_id: Types.ObjectId | null;
  source: "ORDER" | "COMPLIMENTARY";
  starts_at: Date;
  ends_at: Date;
  seats: number;
  branches: number;
  limits_applied: boolean;
  voided_at: Date | null;
  reason: string | null;
  created_by: Types.ObjectId | null;
  created_at: Date;
}

const SubscriptionPeriodSchema = new Schema<ISubscriptionPeriod>(
  {
    agency_id: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    order_id: { type: Schema.Types.ObjectId, ref: "PlatformOrder", default: null },
    source: { type: String, enum: ["ORDER", "COMPLIMENTARY"], required: true },
    starts_at: { type: Date, required: true },
    ends_at: { type: Date, required: true },
    seats: { type: Number, required: true },
    branches: { type: Number, required: true },
    limits_applied: { type: Boolean, default: false },
    voided_at: { type: Date, default: null },
    reason: { type: String, default: null },
    created_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { collection: "platform_subscription_periods", timestamps: { createdAt: "created_at", updatedAt: false } }
);
SubscriptionPeriodSchema.index({ agency_id: 1, ends_at: -1 });
SubscriptionPeriodSchema.index({ limits_applied: 1, starts_at: 1 });

export const SubscriptionPeriod =
  (mongoose.models.SubscriptionPeriod as mongoose.Model<ISubscriptionPeriod>) ||
  mongoose.model<ISubscriptionPeriod>("SubscriptionPeriod", SubscriptionPeriodSchema);

export interface IReceiptLine {
  label: string;
  amount: number;
}

export interface IReceipt {
  _id: Types.ObjectId;
  receipt_number: string;
  order_id: Types.ObjectId;
  agency_id: Types.ObjectId;
  issued_at: Date;
  issued_by: Types.ObjectId | null;
  lines: IReceiptLine[];
  details: Record<string, unknown>;
  total: number;
  voided_at: Date | null;
  void_reason: string | null;
}

const ReceiptSchema = new Schema<IReceipt>(
  {
    receipt_number: { type: String, required: true, unique: true },
    order_id: { type: Schema.Types.ObjectId, ref: "PlatformOrder", required: true, unique: true },
    agency_id: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    issued_at: { type: Date, default: Date.now },
    issued_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    lines: { type: [{ label: String, amount: Number, _id: false }], default: [] },
    details: { type: Schema.Types.Mixed, default: {} },
    total: { type: Number, required: true },
    voided_at: { type: Date, default: null },
    void_reason: { type: String, default: null },
  },
  { collection: "platform_receipts", versionKey: false }
);

export const Receipt =
  (mongoose.models.PlatformReceipt as mongoose.Model<IReceipt>) || mongoose.model<IReceipt>("PlatformReceipt", ReceiptSchema);

// ---------------------------------------------------------------------------
// Commissions (architecture §9.5)
// ---------------------------------------------------------------------------
export interface ICommissionEarner {
  _id: Types.ObjectId;
  type: "SALES_EXECUTIVE" | "AFFILIATE";
  platform_user_id: Types.ObjectId | null;
  name: string;
  phone: string;
  email: string;
  commission_percent: number;
  commission_scope: "FIRST_PAYMENT_ONLY" | "ALL_PAYMENTS";
  is_active: boolean;
  notes: string;
  created_by: Types.ObjectId | null;
  created_at: Date;
  updated_at: Date;
}

const CommissionEarnerSchema = new Schema<ICommissionEarner>(
  {
    type: { type: String, enum: ["SALES_EXECUTIVE", "AFFILIATE"], required: true },
    platform_user_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
    name: { type: String, required: true },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    commission_percent: { type: Number, default: 0, min: 0, max: 100 },
    commission_scope: { type: String, enum: ["FIRST_PAYMENT_ONLY", "ALL_PAYMENTS"], default: "FIRST_PAYMENT_ONLY" },
    is_active: { type: Boolean, default: true },
    notes: { type: String, default: "" },
    created_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { collection: "platform_commission_earners", timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);
CommissionEarnerSchema.index(
  { platform_user_id: 1 },
  { unique: true, partialFilterExpression: { platform_user_id: { $type: "objectId" } } }
);

export const CommissionEarner =
  (mongoose.models.CommissionEarner as mongoose.Model<ICommissionEarner>) ||
  mongoose.model<ICommissionEarner>("CommissionEarner", CommissionEarnerSchema);

export interface ICommissionEntry {
  _id: Types.ObjectId;
  earner_id: Types.ObjectId;
  order_id: Types.ObjectId;
  kind: "ACCRUAL" | "REVERSAL";
  basis_amount: number;
  rate_percent: number;
  amount: number;
  status: "ACCRUED" | "PAID";
  payout_id: Types.ObjectId | null;
  created_at: Date;
}

const CommissionEntrySchema = new Schema<ICommissionEntry>(
  {
    earner_id: { type: Schema.Types.ObjectId, ref: "CommissionEarner", required: true },
    order_id: { type: Schema.Types.ObjectId, ref: "PlatformOrder", required: true },
    kind: { type: String, enum: ["ACCRUAL", "REVERSAL"], required: true },
    basis_amount: { type: Number, required: true },
    rate_percent: { type: Number, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ["ACCRUED", "PAID"], default: "ACCRUED" },
    payout_id: { type: Schema.Types.ObjectId, ref: "CommissionPayout", default: null },
    created_at: { type: Date, default: Date.now },
  },
  { collection: "platform_commission_entries", versionKey: false }
);
CommissionEntrySchema.index({ earner_id: 1, status: 1, created_at: 1 });
CommissionEntrySchema.index({ order_id: 1, kind: 1 }, { unique: true });

export const CommissionEntry =
  (mongoose.models.CommissionEntry as mongoose.Model<ICommissionEntry>) ||
  mongoose.model<ICommissionEntry>("CommissionEntry", CommissionEntrySchema);

export interface ICommissionPayout {
  _id: Types.ObjectId;
  earner_id: Types.ObjectId;
  amount: number;
  paid_at: Date;
  method: string;
  reference: string;
  note: string;
  recorded_by: Types.ObjectId | null;
  created_at: Date;
}

const CommissionPayoutSchema = new Schema<ICommissionPayout>(
  {
    earner_id: { type: Schema.Types.ObjectId, ref: "CommissionEarner", required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    paid_at: { type: Date, required: true },
    method: { type: String, default: "" },
    reference: { type: String, default: "" },
    note: { type: String, default: "" },
    recorded_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { collection: "platform_commission_payouts", timestamps: { createdAt: "created_at", updatedAt: false } }
);

export const CommissionPayout =
  (mongoose.models.CommissionPayout as mongoose.Model<ICommissionPayout>) ||
  mongoose.model<ICommissionPayout>("CommissionPayout", CommissionPayoutSchema);

// ---------------------------------------------------------------------------
// Platform costs (architecture §9.8)
// ---------------------------------------------------------------------------
export const COST_CATEGORIES = ["INFRASTRUCTURE", "EMAIL", "SALARIES", "MARKETING", "SUPPORT_TOOLS", "OTHER"] as const;

export interface IPlatformCost {
  _id: Types.ObjectId;
  cost_date: Date;
  category: (typeof COST_CATEGORIES)[number];
  description: string;
  amount: number;
  is_recurring_monthly: boolean;
  recurring_ends_on: Date | null;
  recurring_parent_id: Types.ObjectId | null;
  voided_at: Date | null;
  void_reason: string | null;
  created_by: Types.ObjectId | null;
  created_at: Date;
  updated_at: Date;
}

const PlatformCostSchema = new Schema<IPlatformCost>(
  {
    cost_date: { type: Date, required: true },
    category: { type: String, enum: COST_CATEGORIES, required: true },
    description: { type: String, default: "" },
    amount: { type: Number, required: true, min: 0 },
    is_recurring_monthly: { type: Boolean, default: false },
    recurring_ends_on: { type: Date, default: null },
    recurring_parent_id: { type: Schema.Types.ObjectId, ref: "PlatformCost", default: null },
    voided_at: { type: Date, default: null },
    void_reason: { type: String, default: null },
    created_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { collection: "platform_costs", timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);
PlatformCostSchema.index({ cost_date: -1 });
PlatformCostSchema.index({ recurring_parent_id: 1, cost_date: 1 }, { unique: true, partialFilterExpression: { recurring_parent_id: { $type: "objectId" } } });

export const PlatformCost =
  (mongoose.models.PlatformCost as mongoose.Model<IPlatformCost>) ||
  mongoose.model<IPlatformCost>("PlatformCost", PlatformCostSchema);
