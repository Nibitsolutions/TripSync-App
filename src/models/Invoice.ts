import mongoose, { Schema, Document, Types } from "mongoose";

export type InvoiceStatus = "Draft" | "Posted" | "Voided";

export interface IInvoice extends Document {
  tenant_id: Types.ObjectId;
  customer_id: Types.ObjectId;
  invoice_number: string;
  status: InvoiceStatus;
  currency: string;
  fx_rate_at_posting: number | null;
  total_amount: number;
  booking_reference: string | null;
  bsp_flag: boolean;
  bsp_billing_period: string | null;
  payment_mode: string;
  remarks: string;
  internal_remarks?: string;
  customer_remarks?: string;
  visit_type: string;
  spo_id: Types.ObjectId | null;
  supplier_id: Types.ObjectId | null;
  print_name: string;
  cost_center: string;
  adj_date: Date | null;
  our_xo: string;
  client_xo: string;
  custom_invoice_number?: string;
  created_by: Types.ObjectId;
  updated_by: Types.ObjectId;
  created_at: Date;
  updated_at: Date;
}

const InvoiceSchema = new Schema<IInvoice>(
  {
    tenant_id: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    customer_id: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    invoice_number: { type: String, required: true },
    status: { type: String, enum: ["Draft", "Posted", "Voided"], default: "Draft" },
    currency: { type: String, required: true, default: "PKR" },
    fx_rate_at_posting: { type: Number, default: null },
    total_amount: { type: Number, default: 0 },
    booking_reference: { type: String, default: null },
    bsp_flag: { type: Boolean, default: false },
    bsp_billing_period: { type: String, default: null },
    payment_mode: { type: String, default: "CR" },
    remarks: { type: String, default: "" },
    internal_remarks: { type: String, default: "" },
    customer_remarks: { type: String, default: "" },
    visit_type: { type: String, default: "Visitor" },
    spo_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
    supplier_id: { type: Schema.Types.ObjectId, ref: "Supplier", default: null },
    print_name: { type: String, default: "" },
    cost_center: { type: String, default: "" },
    adj_date: { type: Date, default: null },
    our_xo: { type: String, default: "" },
    client_xo: { type: String, default: "" },
    // Optional customer-supplied reference number, printed as "Cus. Invoice Number"
    custom_invoice_number: { type: String, default: "" },
    created_by: { type: Schema.Types.ObjectId, ref: "User" },
    updated_by: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

InvoiceSchema.index({ tenant_id: 1, invoice_number: 1 }, { unique: true });
InvoiceSchema.index({ tenant_id: 1, status: 1 });
InvoiceSchema.index({ tenant_id: 1, customer_id: 1, status: 1 });

// In dev, hot reload keeps the previously compiled model; drop it so schema changes take effect.
if (process.env.NODE_ENV !== "production" && mongoose.models.Invoice) {
  mongoose.deleteModel("Invoice");
}

export default mongoose.models.Invoice ||mongoose.model<IInvoice>("Invoice", InvoiceSchema);
