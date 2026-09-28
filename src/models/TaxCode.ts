import mongoose, { Schema, Document, Types } from "mongoose";

export type TaxCategory = "Income Tax" | "WHT" | "Airline Tax" | "Other Taxes";

export interface ITaxCode extends Document {
  tenant_id: Types.ObjectId;
  name: string;
  code: string;
  category: TaxCategory;
  default_percentage: number | null;
  applicable_invoice_types: string[];
  active: boolean;
  created_by: Types.ObjectId;
  updated_by?: Types.ObjectId;
  created_at: Date;
  updated_at: Date;
}

const TaxCodeSchema = new Schema<ITaxCode>(
  {
    tenant_id: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true },
    code: { type: String, required: true },
    category: {
      type: String,
      enum: ["Income Tax", "WHT", "Airline Tax", "Other Taxes"],
      required: true,
    },
    default_percentage: { type: Number, default: null },
    // Invoice types this tax code can be selected on (empty = all types, for legacy codes)
    applicable_invoice_types: {
      type: [String],
      enum: ["Ticket", "Hotel", "Umrah", "Hajj", "Visa", "Transport", "Insurance", "General"],
      default: [],
    },
    active: { type: Boolean, default: true },
    created_by: { type: Schema.Types.ObjectId, ref: "User" },
    updated_by: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// In dev, hot reload keeps the previously compiled model; drop it so schema changes take effect.
if (process.env.NODE_ENV !== "production" && mongoose.models.TaxCode) {
  mongoose.deleteModel("TaxCode");
}

export default mongoose.models.TaxCode ||mongoose.model<ITaxCode>("TaxCode", TaxCodeSchema);
