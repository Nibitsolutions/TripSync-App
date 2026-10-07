import mongoose, { Schema, Document, Types } from "mongoose";

// Per-agency sequence counters for document numbers (TCK-1, CUS-1, RV-1, …).
export interface ITenantCounter extends Document {
  tenant_id: Types.ObjectId;
  key: string;
  last_number: number;
}

const TenantCounterSchema = new Schema<ITenantCounter>({
  tenant_id: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  key: { type: String, required: true },
  last_number: { type: Number, default: 0 },
});

TenantCounterSchema.index({ tenant_id: 1, key: 1 }, { unique: true });

export default mongoose.models.TenantCounter || mongoose.model<ITenantCounter>("TenantCounter", TenantCounterSchema);
