import mongoose, { Schema, Document, Types } from "mongoose";

export interface ICustomer extends Document {
  tenant_id: Types.ObjectId;
  code: string; // Code*
  name: string; // Title / Name*
  short_name?: string;
  details?: string;

  // Customer Information
  parent_customer_id?: Types.ObjectId | string | null;
  customer_type: string; // Customer Type* (Corporate, Travel Agent, Branches, Industrial, Walking)
  credit_limit: number | null;
  credit_term?: string;
  ntn_number?: string;
  sale_tax_number?: string;
  date_of_creation?: string;
  date_expiry?: string;
  iata_number?: string;

  // Account Information
  gl_account: string; // GL Account*
  create_auto_ledger: boolean;
  visible_to_all_branches: boolean;
  hide_on_invoices: boolean;

  // SPO
  spo_id?: Types.ObjectId | string | null;
  spo_name: string; // SPO*

  // Address Tab
  address_1?: string;
  address_2?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  city?: string;
  phone_1?: string;
  phone_2?: string;
  fax?: string;

  // Contact Person Tab
  contact_person_name?: string;
  contact_person_designation?: string;
  contact_person_phone?: string;
  contact_person_email?: string;

  contact_info: Record<string, unknown>;
  current_balance: number;
  created_by: Types.ObjectId;
  updated_by: Types.ObjectId;
  created_at: Date;
  updated_at: Date;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    tenant_id: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
    short_name: { type: String, default: "" },
    details: { type: String, default: "" },

    // Customer Information
    parent_customer_id: { type: Schema.Types.Mixed, default: null },
    customer_type: { type: String, default: "Corporate" },
    credit_limit: { type: Number, default: null },
    credit_term: { type: String, default: "" },
    ntn_number: { type: String, default: "" },
    sale_tax_number: { type: String, default: "" },
    date_of_creation: { type: String, default: "" },
    date_expiry: { type: String, default: "" },
    iata_number: { type: String, default: "" },

    // Account Information
    gl_account: { type: String, default: "101001" },
    create_auto_ledger: { type: Boolean, default: true },
    visible_to_all_branches: { type: Boolean, default: true },
    hide_on_invoices: { type: Boolean, default: false },

    // SPO
    spo_id: { type: Schema.Types.Mixed, default: null },
    spo_name: { type: String, default: "SPO 1" },

    // Address Tab
    address_1: { type: String, default: "" },
    address_2: { type: String, default: "" },
    state: { type: String, default: "" },
    zip_code: { type: String, default: "" },
    country: { type: String, default: "Pakistan" },
    city: { type: String, default: "" },
    phone_1: { type: String, default: "" },
    phone_2: { type: String, default: "" },
    fax: { type: String, default: "" },

    // Contact Person Tab
    contact_person_name: { type: String, default: "" },
    contact_person_designation: { type: String, default: "" },
    contact_person_phone: { type: String, default: "" },
    contact_person_email: { type: String, default: "" },

    contact_info: { type: Schema.Types.Mixed, default: {} },
    current_balance: { type: Number, default: 0 },
    created_by: { type: Schema.Types.ObjectId, ref: "User" },
    updated_by: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

CustomerSchema.index({ tenant_id: 1, name: 1 });
CustomerSchema.index({ tenant_id: 1, code: 1 });

export default mongoose.models.Customer || mongoose.model<ICustomer>("Customer", CustomerSchema);
