import mongoose, { Schema, Document, Types } from "mongoose";

export interface IApprovalRequest extends Document {
  tenant_id: Types.ObjectId;
  type: "ExpenseApproval";
  related_entity_id: Types.ObjectId;
  requested_by: Types.ObjectId;
  status: "Pending" | "Approved" | "Rejected";
  resolved_by: Types.ObjectId | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const ApprovalRequestSchema = new Schema<IApprovalRequest>(
  {
    tenant_id: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    // Credit-limit overrides were removed; old "CreditLimitOverride" rows are ignored by the API.
    type: { type: String, enum: ["ExpenseApproval"], required: true },
    related_entity_id: { type: Schema.Types.ObjectId, required: true },
    requested_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
    resolved_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    resolved_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

ApprovalRequestSchema.index({ tenant_id: 1, status: 1 });

// In dev, hot reload keeps the previously compiled model; drop it so schema changes take effect.
if (process.env.NODE_ENV !== "production" && mongoose.models.ApprovalRequest) {
  mongoose.deleteModel("ApprovalRequest");
}

export default mongoose.models.ApprovalRequest ||mongoose.model<IApprovalRequest>("ApprovalRequest", ApprovalRequestSchema);
