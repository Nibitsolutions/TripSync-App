import mongoose, { Schema, Document, Types } from "mongoose";

export type BankAccountKind = "Bank" | "Cash";

export interface IBankAccount extends Document {
  tenant_id: Types.ObjectId;
  kind: BankAccountKind;
  // Bank entries
  bank_name: string;
  account_title: string;
  account_number: string;
  branch: string;
  // Cash entries (Cash in Hand, Petty Cash)
  name: string;
  enabled: boolean;
  // Marks entries the system relies on (e.g. "cash_in_hand", pre-filled on Cash Deposit vouchers)
  system_key: string | null;
  created_by?: Types.ObjectId;
  updated_by?: Types.ObjectId;
  created_at: Date;
  updated_at: Date;
}

const BankAccountSchema = new Schema<IBankAccount>(
  {
    tenant_id: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    kind: { type: String, enum: ["Bank", "Cash"], required: true },
    bank_name: { type: String, default: "" },
    account_title: { type: String, default: "" },
    account_number: { type: String, default: "" },
    branch: { type: String, default: "" },
    name: { type: String, default: "" },
    enabled: { type: Boolean, default: true },
    system_key: { type: String, default: null },
    created_by: { type: Schema.Types.ObjectId, ref: "User" },
    updated_by: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// One entry per system key per agency (guards against double seeding on concurrent loads)
BankAccountSchema.index(
  { tenant_id: 1, system_key: 1 },
  { unique: true, partialFilterExpression: { system_key: { $type: "string" } } }
);

// In dev, hot reload keeps the previously compiled model; drop it so schema changes take effect.
if (process.env.NODE_ENV !== "production" && mongoose.models.BankAccount) {
  mongoose.deleteModel("BankAccount");
}

export default mongoose.models.BankAccount || mongoose.model<IBankAccount>("BankAccount", BankAccountSchema);
