import mongoose, { Schema, Document, Types } from "mongoose";

export interface ICustomer extends Document {
  tenant_id: Types.ObjectId;
  name: string;
  code: string;
  contact_info: Record<string, unknown>;
  credit_limit: number | null;
  current_balance: number;
  created_by: Types.ObjectId;
  updated_by: Types.ObjectId;
  created_at: Date;
  updated_at: Date;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    tenant_id: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true },
    code: { type: String, default: "" },
    contact_info: { type: Schema.Types.Mixed, default: {} },
    credit_limit: { type: Number, default: null },
    current_balance: { type: Number, default: 0 },
    created_by: { type: Schema.Types.ObjectId, ref: "User" },
    updated_by: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

CustomerSchema.index({ tenant_id: 1, name: 1 });
CustomerSchema.index({ tenant_id: 1, code: 1 });

export default mongoose.models.Customer || mongoose.model<ICustomer>("Customer", CustomerSchema);
