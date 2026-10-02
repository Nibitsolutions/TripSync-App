import mongoose, { Schema, Types } from "mongoose";

// ---------------------------------------------------------------------------
// Platform audit log (architecture §7.12, §9.8). Append-only: every update or
// delete path on the model throws, so application code can never rewrite history.
// ---------------------------------------------------------------------------
export interface IPlatformAuditLog {
  _id: Types.ObjectId;
  occurred_at: Date;
  actor_type: "PLATFORM_USER" | "SYSTEM" | "AGENCY_USER" | "PUBLIC";
  actor_id: Types.ObjectId | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  agency_id: Types.ObjectId | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
}

const PlatformAuditLogSchema = new Schema<IPlatformAuditLog>(
  {
    occurred_at: { type: Date, default: Date.now, immutable: true },
    actor_type: { type: String, enum: ["PLATFORM_USER", "SYSTEM", "AGENCY_USER", "PUBLIC"], required: true },
    actor_id: { type: Schema.Types.ObjectId, default: null },
    actor_name: { type: String, default: null },
    actor_role: { type: String, default: null },
    action: { type: String, required: true },
    entity_type: { type: String, required: true },
    entity_id: { type: String, default: null },
    agency_id: { type: Schema.Types.ObjectId, ref: "Tenant", default: null },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    reason: { type: String, default: null },
    ip: { type: String, default: null },
    user_agent: { type: String, default: null },
    request_id: { type: String, default: null },
  },
  { collection: "platform_audit_logs", versionKey: false }
);

PlatformAuditLogSchema.index({ agency_id: 1, occurred_at: -1 });
PlatformAuditLogSchema.index({ actor_id: 1, occurred_at: -1 });
PlatformAuditLogSchema.index({ entity_type: 1, entity_id: 1 });
PlatformAuditLogSchema.index({ occurred_at: -1 });

const IMMUTABLE_OPS = [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "findOneAndReplace",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
] as const;
for (const op of IMMUTABLE_OPS) {
  PlatformAuditLogSchema.pre(op as "updateOne", function () {
    throw new Error("platform_audit_logs is append-only");
  });
}
PlatformAuditLogSchema.pre("save", function () {
  if (!this.isNew) throw new Error("platform_audit_logs is append-only");
});

export const PlatformAuditLog =
  (mongoose.models.PlatformAuditLog as mongoose.Model<IPlatformAuditLog>) ||
  mongoose.model<IPlatformAuditLog>("PlatformAuditLog", PlatformAuditLogSchema);

// ---------------------------------------------------------------------------
// Settings (architecture §7.13) — one document per key.
// ---------------------------------------------------------------------------
export interface IPlatformSetting {
  _id: Types.ObjectId;
  key: string;
  value: unknown;
  updated_by: Types.ObjectId | null;
  updated_at: Date;
}

const PlatformSettingSchema = new Schema<IPlatformSetting>(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, default: null },
    updated_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: "platform_settings", minimize: false }
);

export const PlatformSetting =
  (mongoose.models.PlatformSetting as mongoose.Model<IPlatformSetting>) ||
  mongoose.model<IPlatformSetting>("PlatformSetting", PlatformSettingSchema);

// ---------------------------------------------------------------------------
// Counters — gapless sequences (ORD-, RCT-, TKT-). Incremented inside the same
// transaction as the document that consumes the number, so an aborted
// transaction never burns a number (N7).
// ---------------------------------------------------------------------------
export interface IPlatformCounter {
  _id: string;
  last_number: number;
}

const PlatformCounterSchema = new Schema<IPlatformCounter>(
  { _id: { type: String, required: true }, last_number: { type: Number, default: 0 } },
  { collection: "platform_counters", versionKey: false }
);

export const PlatformCounter =
  (mongoose.models.PlatformCounter as mongoose.Model<IPlatformCounter>) ||
  mongoose.model<IPlatformCounter>("PlatformCounter", PlatformCounterSchema);

// ---------------------------------------------------------------------------
// Auth tokens — set-password / verify / password-reset / invite / unsubscribe.
// Only the sha256 of the token is stored; single-use.
// ---------------------------------------------------------------------------
export interface IAuthToken {
  _id: Types.ObjectId;
  token_hash: string;
  purpose: "SET_PASSWORD" | "PASSWORD_RESET";
  user_id: Types.ObjectId;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

const AuthTokenSchema = new Schema<IAuthToken>(
  {
    token_hash: { type: String, required: true, unique: true },
    purpose: { type: String, enum: ["SET_PASSWORD", "PASSWORD_RESET"], required: true },
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    expires_at: { type: Date, required: true },
    used_at: { type: Date, default: null },
    created_at: { type: Date, default: Date.now },
  },
  { collection: "platform_auth_tokens" }
);
AuthTokenSchema.index({ expires_at: 1 });

export const AuthToken =
  (mongoose.models.AuthToken as mongoose.Model<IAuthToken>) ||
  mongoose.model<IAuthToken>("AuthToken", AuthTokenSchema);

// ---------------------------------------------------------------------------
// Marketing consents (architecture §9.2)
// ---------------------------------------------------------------------------
export interface IMarketingConsent {
  _id: Types.ObjectId;
  agency_id: Types.ObjectId | null;
  email: string;
  data_consent: boolean;
  marketing_consent: boolean;
  consent_text_version: string;
  captured_at: Date;
  ip: string | null;
  user_agent: string | null;
  unsubscribed_at: Date | null;
}

const MarketingConsentSchema = new Schema<IMarketingConsent>(
  {
    agency_id: { type: Schema.Types.ObjectId, ref: "Tenant", default: null },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    data_consent: { type: Boolean, default: false },
    marketing_consent: { type: Boolean, default: false },
    consent_text_version: { type: String, default: "v1" },
    captured_at: { type: Date, default: Date.now },
    ip: { type: String, default: null },
    user_agent: { type: String, default: null },
    unsubscribed_at: { type: Date, default: null },
  },
  { collection: "platform_marketing_consents" }
);

export const MarketingConsent =
  (mongoose.models.MarketingConsent as mongoose.Model<IMarketingConsent>) ||
  mongoose.model<IMarketingConsent>("MarketingConsent", MarketingConsentSchema);

// ---------------------------------------------------------------------------
// Job locks / run status — replaces pg-boss scheduling state.
// ---------------------------------------------------------------------------
export interface IJobState {
  _id: string; // job name
  locked_until: Date | null;
  last_started_at: Date | null;
  last_finished_at: Date | null;
  last_error: string | null;
  consecutive_failures: number;
}

const JobStateSchema = new Schema<IJobState>(
  {
    _id: { type: String, required: true },
    locked_until: { type: Date, default: null },
    last_started_at: { type: Date, default: null },
    last_finished_at: { type: Date, default: null },
    last_error: { type: String, default: null },
    consecutive_failures: { type: Number, default: 0 },
  },
  { collection: "platform_job_state", versionKey: false }
);

export const JobState =
  (mongoose.models.JobState as mongoose.Model<IJobState>) || mongoose.model<IJobState>("JobState", JobStateSchema);
