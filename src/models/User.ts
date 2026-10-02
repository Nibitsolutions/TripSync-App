import mongoose, { Schema, Document, Types } from "mongoose";

// Agency roles: Owner, Accountant, Agent, Viewer (tenant_id set).
// Platform roles: SuperAdmin, Manager, SalesExecutive (tenant_id null).
export type UserRole = "SuperAdmin" | "Manager" | "SalesExecutive" | "Owner" | "Accountant" | "Agent" | "Viewer";

export const PLATFORM_ROLES = ["SuperAdmin", "Manager", "SalesExecutive"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export interface IUser extends Document {
  tenant_id: Types.ObjectId | null;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  default_commission_rate: number | null;
  is_active: boolean;
  // Platform security (architecture §4.1)
  failed_attempts: number;
  locked_until: Date | null;
  last_login_at: Date | null;
  totp_secret_encrypted: string | null;
  totp_enabled: boolean;
  created_by: Types.ObjectId | null;
  created_at: Date;
  updated_at: Date;
}

const UserSchema = new Schema<IUser>(
  {
    tenant_id: { type: Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["SuperAdmin", "Manager", "SalesExecutive", "Owner", "Accountant", "Agent", "Viewer"],
      required: true,
    },
    default_commission_rate: { type: Number, default: null },
    is_active: { type: Boolean, default: true },
    failed_attempts: { type: Number, default: 0 },
    locked_until: { type: Date, default: null },
    last_login_at: { type: Date, default: null },
    totp_secret_encrypted: { type: String, default: null },
    totp_enabled: { type: Boolean, default: false },
    created_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export default mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
