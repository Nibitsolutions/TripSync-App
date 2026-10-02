import mongoose, { Schema, Types } from "mongoose";

// ---------------------------------------------------------------------------
// Support (architecture §9.6)
// ---------------------------------------------------------------------------
export const TICKET_CATEGORIES = ["BILLING", "TECHNICAL", "HOW_TO", "FEATURE_REQUEST", "ACCOUNT", "OTHER"] as const;
export const TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export interface ISupportTicket {
  _id: Types.ObjectId;
  ticket_number: string;
  agency_id: Types.ObjectId;
  created_by_agency_user_id: Types.ObjectId | null;
  subject: string;
  category: (typeof TICKET_CATEGORIES)[number];
  priority: (typeof TICKET_PRIORITIES)[number];
  status: TicketStatus;
  assigned_to_platform_user_id: Types.ObjectId | null;
  last_message_at: Date;
  last_message_by: "AGENCY" | "STAFF";
  agency_last_read_at: Date | null;
  staff_last_read_at: Date | null;
  resolved_at: Date | null;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const SupportTicketSchema = new Schema<ISupportTicket>(
  {
    ticket_number: { type: String, required: true, unique: true },
    agency_id: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    created_by_agency_user_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
    subject: { type: String, required: true, maxlength: 200 },
    category: { type: String, enum: TICKET_CATEGORIES, default: "OTHER" },
    priority: { type: String, enum: TICKET_PRIORITIES, default: "NORMAL" },
    status: { type: String, enum: TICKET_STATUSES, default: "OPEN" },
    assigned_to_platform_user_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
    last_message_at: { type: Date, default: Date.now },
    last_message_by: { type: String, enum: ["AGENCY", "STAFF"], default: "AGENCY" },
    agency_last_read_at: { type: Date, default: null },
    staff_last_read_at: { type: Date, default: null },
    resolved_at: { type: Date, default: null },
    closed_at: { type: Date, default: null },
  },
  { collection: "platform_support_tickets", timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);
SupportTicketSchema.index({ agency_id: 1, status: 1 });
SupportTicketSchema.index({ assigned_to_platform_user_id: 1, status: 1 });
SupportTicketSchema.index({ last_message_at: -1 });

export const SupportTicket =
  (mongoose.models.SupportTicket as mongoose.Model<ISupportTicket>) ||
  mongoose.model<ISupportTicket>("SupportTicket", SupportTicketSchema);

export interface ISupportMessage {
  _id: Types.ObjectId;
  ticket_id: Types.ObjectId;
  agency_id: Types.ObjectId;
  sender_type: "AGENCY_USER" | "PLATFORM_USER" | "SYSTEM";
  sender_agency_user_id: Types.ObjectId | null;
  sender_platform_user_id: Types.ObjectId | null;
  sender_name: string;
  body: string;
  created_at: Date;
}

const SupportMessageSchema = new Schema<ISupportMessage>(
  {
    ticket_id: { type: Schema.Types.ObjectId, ref: "SupportTicket", required: true },
    agency_id: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    sender_type: { type: String, enum: ["AGENCY_USER", "PLATFORM_USER", "SYSTEM"], required: true },
    sender_agency_user_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
    sender_platform_user_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
    sender_name: { type: String, default: "" },
    body: { type: String, required: true, maxlength: 4000 },
    created_at: { type: Date, default: Date.now },
  },
  { collection: "platform_support_messages", versionKey: false }
);
SupportMessageSchema.index({ ticket_id: 1, created_at: 1 });
SupportMessageSchema.index({ sender_agency_user_id: 1, created_at: -1 });
SupportMessageSchema.index({ sender_platform_user_id: 1, created_at: -1 });
// Append-only.
for (const op of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne"] as const) {
  SupportMessageSchema.pre(op as "updateOne", function () {
    throw new Error("support messages are append-only");
  });
}

export const SupportMessage =
  (mongoose.models.SupportMessage as mongoose.Model<ISupportMessage>) ||
  mongoose.model<ISupportMessage>("SupportMessage", SupportMessageSchema);

// ---------------------------------------------------------------------------
// Email outbox (architecture §9.7). Every email goes through here (N9).
// ---------------------------------------------------------------------------
export const EMAIL_CATEGORIES = ["AUTH", "ORDER", "RECEIPT", "REMINDER", "LIFECYCLE", "SUPPORT", "BROADCAST", "SYSTEM_ALERT"] as const;

export interface IEmailOutbox {
  _id: Types.ObjectId;
  to_email: string;
  subject: string;
  html: string;
  text: string;
  category: (typeof EMAIL_CATEGORIES)[number];
  related_type: string | null;
  related_id: string | null;
  status: "PENDING" | "SENDING" | "SENT" | "FAILED";
  attempts: number;
  next_attempt_at: Date;
  last_error: string | null;
  sent_at: Date | null;
  idempotency_key: string;
  created_at: Date;
}

const EmailOutboxSchema = new Schema<IEmailOutbox>(
  {
    to_email: { type: String, required: true },
    subject: { type: String, required: true },
    html: { type: String, default: "" },
    text: { type: String, default: "" },
    category: { type: String, enum: EMAIL_CATEGORIES, required: true },
    related_type: { type: String, default: null },
    related_id: { type: String, default: null },
    status: { type: String, enum: ["PENDING", "SENDING", "SENT", "FAILED"], default: "PENDING" },
    attempts: { type: Number, default: 0 },
    next_attempt_at: { type: Date, default: Date.now },
    last_error: { type: String, default: null },
    sent_at: { type: Date, default: null },
    idempotency_key: { type: String, required: true, unique: true },
    created_at: { type: Date, default: Date.now },
  },
  { collection: "platform_email_outbox", versionKey: false }
);
EmailOutboxSchema.index({ status: 1, next_attempt_at: 1 });
EmailOutboxSchema.index({ related_type: 1, related_id: 1 });
EmailOutboxSchema.index({ sent_at: -1 });

export const EmailOutbox =
  (mongoose.models.EmailOutbox as mongoose.Model<IEmailOutbox>) ||
  mongoose.model<IEmailOutbox>("EmailOutbox", EmailOutboxSchema);

// ---------------------------------------------------------------------------
// Broadcasts (architecture §7.7)
// ---------------------------------------------------------------------------
export interface IAudienceFilter {
  statuses?: string[];
  expiring_within_days?: number | null;
  sources?: string[];
  sales_owner_id?: string | null;
  consent_only?: boolean;
  created_from?: string | null;
  created_to?: string | null;
  trial_expired_never_paid?: boolean;
}

export interface IBroadcast {
  _id: Types.ObjectId;
  subject: string;
  html_body: string;
  text_body: string;
  type: "PROMOTIONAL" | "OPERATIONAL";
  audience_filter: IAudienceFilter;
  status: "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "CANCELLED";
  scheduled_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  recipient_count: number;
  created_by: Types.ObjectId | null;
  created_at: Date;
  updated_at: Date;
}

const BroadcastSchema = new Schema<IBroadcast>(
  {
    subject: { type: String, required: true },
    html_body: { type: String, default: "" },
    text_body: { type: String, default: "" },
    type: { type: String, enum: ["PROMOTIONAL", "OPERATIONAL"], required: true },
    audience_filter: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ["DRAFT", "SCHEDULED", "SENDING", "SENT", "CANCELLED"], default: "DRAFT" },
    scheduled_at: { type: Date, default: null },
    started_at: { type: Date, default: null },
    completed_at: { type: Date, default: null },
    recipient_count: { type: Number, default: 0 },
    created_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { collection: "platform_broadcasts", timestamps: { createdAt: "created_at", updatedAt: "updated_at" }, minimize: false }
);
BroadcastSchema.index({ status: 1, scheduled_at: 1 });

export const Broadcast =
  (mongoose.models.Broadcast as mongoose.Model<IBroadcast>) || mongoose.model<IBroadcast>("Broadcast", BroadcastSchema);

export interface IBroadcastRecipient {
  _id: Types.ObjectId;
  broadcast_id: Types.ObjectId;
  agency_id: Types.ObjectId;
  email: string;
  outbox_id: Types.ObjectId | null;
  status: "QUEUED" | "SENT" | "FAILED" | "SKIPPED";
  skip_reason: string | null;
}

const BroadcastRecipientSchema = new Schema<IBroadcastRecipient>(
  {
    broadcast_id: { type: Schema.Types.ObjectId, ref: "Broadcast", required: true },
    agency_id: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    email: { type: String, required: true },
    outbox_id: { type: Schema.Types.ObjectId, ref: "EmailOutbox", default: null },
    status: { type: String, enum: ["QUEUED", "SENT", "FAILED", "SKIPPED"], default: "QUEUED" },
    skip_reason: { type: String, default: null },
  },
  { collection: "platform_broadcast_recipients", versionKey: false }
);
BroadcastRecipientSchema.index({ broadcast_id: 1, agency_id: 1 }, { unique: true });
BroadcastRecipientSchema.index({ broadcast_id: 1, status: 1 });

export const BroadcastRecipient =
  (mongoose.models.BroadcastRecipient as mongoose.Model<IBroadcastRecipient>) ||
  mongoose.model<IBroadcastRecipient>("BroadcastRecipient", BroadcastRecipientSchema);

export interface IExpiryReminderSent {
  _id: Types.ObjectId;
  agency_id: Types.ObjectId;
  expires_at: Date;
  offset_hours: number;
  sent_at: Date;
}

const ExpiryReminderSentSchema = new Schema<IExpiryReminderSent>(
  {
    agency_id: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    expires_at: { type: Date, required: true },
    offset_hours: { type: Number, required: true },
    sent_at: { type: Date, default: Date.now },
  },
  { collection: "platform_expiry_reminders_sent", versionKey: false }
);
ExpiryReminderSentSchema.index({ agency_id: 1, expires_at: 1, offset_hours: 1 }, { unique: true });

export const ExpiryReminderSent =
  (mongoose.models.ExpiryReminderSent as mongoose.Model<IExpiryReminderSent>) ||
  mongoose.model<IExpiryReminderSent>("ExpiryReminderSent", ExpiryReminderSentSchema);

// ---------------------------------------------------------------------------
// Maintenance windows (architecture §7.8)
// ---------------------------------------------------------------------------
export interface IMaintenanceWindow {
  _id: Types.ObjectId;
  title: string;
  reason_message: string;
  starts_at: Date;
  ends_at: Date;
  notify_in_app_from: Date;
  is_cancelled: boolean;
  started_early_at: Date | null;
  ended_early_at: Date | null;
  broadcast_id: Types.ObjectId | null;
  created_by: Types.ObjectId | null;
  created_at: Date;
  updated_at: Date;
}

const MaintenanceWindowSchema = new Schema<IMaintenanceWindow>(
  {
    title: { type: String, required: true },
    reason_message: { type: String, default: "" },
    starts_at: { type: Date, required: true },
    ends_at: { type: Date, required: true },
    notify_in_app_from: { type: Date, default: Date.now },
    is_cancelled: { type: Boolean, default: false },
    started_early_at: { type: Date, default: null },
    ended_early_at: { type: Date, default: null },
    broadcast_id: { type: Schema.Types.ObjectId, ref: "Broadcast", default: null },
    created_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { collection: "platform_maintenance_windows", timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);
MaintenanceWindowSchema.index({ starts_at: 1, ends_at: 1 });

export const MaintenanceWindow =
  (mongoose.models.MaintenanceWindow as mongoose.Model<IMaintenanceWindow>) ||
  mongoose.model<IMaintenanceWindow>("MaintenanceWindow", MaintenanceWindowSchema);

// ---------------------------------------------------------------------------
// Tenant archives (architecture §7.9)
// ---------------------------------------------------------------------------
export interface ITenantArchive {
  _id: Types.ObjectId;
  agency_id: Types.ObjectId;
  kind: "COLD_STORAGE" | "MANUAL_EXPORT";
  status: "RUNNING" | "VERIFIED" | "FAILED" | "DELETED";
  object_key: string | null;
  size_bytes: number;
  sha256: string | null;
  manifest: Record<string, unknown>;
  schema_version: number;
  verified_at: Date | null;
  error: string | null;
  decision: "PENDING" | "RETAINED" | "DELETED";
  decided_by: Types.ObjectId | null;
  decided_at: Date | null;
  decision_note: string | null;
  restored_at: Date | null;
  created_at: Date;
}

const TenantArchiveSchema = new Schema<ITenantArchive>(
  {
    agency_id: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    kind: { type: String, enum: ["COLD_STORAGE", "MANUAL_EXPORT"], required: true },
    status: { type: String, enum: ["RUNNING", "VERIFIED", "FAILED", "DELETED"], default: "RUNNING" },
    object_key: { type: String, default: null },
    size_bytes: { type: Number, default: 0 },
    sha256: { type: String, default: null },
    manifest: { type: Schema.Types.Mixed, default: {} },
    schema_version: { type: Number, default: 1 },
    verified_at: { type: Date, default: null },
    error: { type: String, default: null },
    decision: { type: String, enum: ["PENDING", "RETAINED", "DELETED"], default: "PENDING" },
    decided_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    decided_at: { type: Date, default: null },
    decision_note: { type: String, default: null },
    restored_at: { type: Date, default: null },
  },
  { collection: "platform_tenant_archives", timestamps: { createdAt: "created_at", updatedAt: false }, minimize: false }
);

export const TenantArchive =
  (mongoose.models.TenantArchive as mongoose.Model<ITenantArchive>) ||
  mongoose.model<ITenantArchive>("TenantArchive", TenantArchiveSchema);
