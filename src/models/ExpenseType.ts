import mongoose, { Schema, Document, Types } from "mongoose";

export interface IExpenseType extends Document {
  tenant_id: Types.ObjectId;
  name: string;
  created_by: Types.ObjectId;
  created_at: Date;
  updated_at: Date;
}

const ExpenseTypeSchema = new Schema<IExpenseType>(
  {
    tenant_id: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true },
    created_by: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export default mongoose.models.ExpenseType || mongoose.model<IExpenseType>("ExpenseType", ExpenseTypeSchema);
