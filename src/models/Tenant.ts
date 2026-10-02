import mongoose, { Schema, Document, Types } from "mongoose";

// Platform lifecycle states (architecture §5.1). Legacy values ("Active", "Suspended",
// "Expired") are migrated to the upper-case names by lib/platform/lifecycle.ts.
export const TENANT_STATUSES = [
  "PENDING",
  "REJECTED",
  "TRIAL",
  "ACTIVE",
  "EXPIRED",
  "SUSPENDED",
  "OFFBOARDED",
  "COLD_STORAGE",
  "PURGED",
] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const TENANT_SOURCES = ["PUBLIC_TRIAL", "PUBLIC_PURCHASE", "SALES_EXEC", "ADMIN_CREATED", "LEGACY"] as const;
export type TenantSource = (typeof TENANT_SOURCES)[number];

export const OFFBOARD_REASONS = ["PAUSED", "LEFT", "NON_PAYMENT", "OTHER"] as const;

export interface ITenant extends Document {
  name: string;
  base_currency: string;
  invoice_prefix: string;
  status: TenantStatus;
  // `access_expires_at` is the spec's `expires_at` — single source of truth for access.
  access_expires_at: Date | null;
  // `max_users` is the spec's `seat_limit`.
  max_users: number;
  branch_limit: number;
  contact_person: string;
  contact_email: string;
  contact_phone: string;
  notes: string;
  // Branding / invoice fields
  logo_url: string;
  address: string;
  city: string;
  website: string;
  tagline: string;
  invoice_notes: string;

  // Platform admin fields (architecture §9.1)
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  business_phone: string;
  business_email: string;
  business_address: string;
  source: TenantSource;
  sales_owner_id: Types.ObjectId | null;
  referrer_earner_id: Types.ObjectId | null;
  trial_ends_at: Date | null;
  suspended_at: Date | null;
  resume_status: TenantStatus | null;
  suspension_reason: string | null;
  offboarded_at: Date | null;
  offboard_reason: string | null;
  offboard_note: string | null;
  retention_months: number | null;
  retention_until: Date | null;
  cold_storage_at: Date | null;
  purged_at: Date | null;
  session_epoch: number;
  enabled_modules: Record<string, unknown>;
  possible_duplicate: boolean;
  internal_note: string | null;
  marketing_consent: boolean;
  last_active_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const TenantSchema = new Schema<ITenant>(
  {
    name: { type: String, required: true },
    base_currency: { type: String, required: true, default: "PKR" },
    invoice_prefix: { type: String, required: true, default: "INV" },
    status: { type: String, enum: [...TENANT_STATUSES, "Active", "Suspended", "Expired"], default: "TRIAL" },
    access_expires_at: { type: Date, default: null },
    max_users: { type: Number, default: 10 },
    branch_limit: { type: Number, default: 1 },
    contact_person: { type: String, default: "" },
    contact_email: { type: String, default: "" },
    contact_phone: { type: String, default: "" },
    notes: { type: String, default: "" },
    logo_url: { type: String, default: "" },
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    website: { type: String, default: "" },
    tagline: { type: String, default: "" },
    invoice_notes: { type: String, default: "" },

    owner_name: { type: String, default: "" },
    owner_email: { type: String, default: "", lowercase: true, trim: true },
    owner_phone: { type: String, default: "" },
    business_phone: { type: String, default: "" },
    business_email: { type: String, default: "" },
    business_address: { type: String, default: "" },
    source: { type: String, enum: TENANT_SOURCES, default: "LEGACY" },
    sales_owner_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
    referrer_earner_id: { type: Schema.Types.ObjectId, ref: "CommissionEarner", default: null },
    trial_ends_at: { type: Date, default: null },
    suspended_at: { type: Date, default: null },
    resume_status: { type: String, default: null },
    suspension_reason: { type: String, default: null },
    offboarded_at: { type: Date, default: null },
    offboard_reason: { type: String, enum: [...OFFBOARD_REASONS, null], default: null },
    offboard_note: { type: String, default: null },
    retention_months: { type: Number, default: null },
    retention_until: { type: Date, default: null },
    cold_storage_at: { type: Date, default: null },
    purged_at: { type: Date, default: null },
    session_epoch: { type: Number, default: 0 },
    enabled_modules: { type: Schema.Types.Mixed, default: {} },
    possible_duplicate: { type: Boolean, default: false },
    internal_note: { type: String, default: null },
    marketing_consent: { type: Boolean, default: false },
    last_active_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" }, minimize: false }
);

TenantSchema.index({ status: 1, access_expires_at: 1 });
TenantSchema.index({ sales_owner_id: 1 });
TenantSchema.index({ owner_email: 1 });
TenantSchema.index({ source: 1 });

export default mongoose.models.Tenant || mongoose.model<ITenant>("Tenant", TenantSchema);
