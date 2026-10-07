import mongoose, { Schema, Document, Types } from "mongoose";

export type ExpenseStatus = "Draft" | "Posted" | "Voided";

export interface IExpense extends Document {
  tenant_id: Types.ObjectId;
  expense_type_id: Types.ObjectId;
  amount: number;
  description: string;
  status: ExpenseStatus;
  created_by: Types.ObjectId;
  updated_by: Types.ObjectId;
  created_at: Date;
  updated_at: Date;
}

const ExpenseSchema = new Schema<IExpense>(
  {
    tenant_id: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    expense_type_id: { type: Schema.Types.ObjectId, ref: "ExpenseType", required: true },
    amount: { type: Number, required: true },
    description: { type: String, default: "" },
    status: { type: String, enum: ["Draft", "Posted", "Voided"], default: "Draft" },
    created_by: { type: Schema.Types.ObjectId, ref: "User" },
    updated_by: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export default mongoose.models.Expense || mongoose.model<IExpense>("Expense", ExpenseSchema);
