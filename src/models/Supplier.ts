import mongoose, { Schema, Document, Types } from "mongoose";

export const SUPPLIER_VENDOR_CATEGORIES = ["Airline", "Hotel", "Transport", "Visa Agency", "General"] as const;

export interface ISupplierContactPerson {
  name: string; // Name*
  designation: string; // Designation*
  cell_phone: string;
  phone: string;
  fax: string;
  email: string;
}

export interface ISupplierVendor {
  category: string; // Airline | Hotel | Transport | Visa Agency | General
  title: string;
  details: string;
}

export interface ISupplier extends Document {
  tenant_id: Types.ObjectId;

  // General Information
  code: string; // Code*
  name: string; // Title*
  short_name: string;
  details: string;

  // Account Information
  gl_account: string; // GL Account*
  credit_limit: number | null;
  create_auto_ledger: boolean;
  visible_to_all_branches: boolean;
  add_all_vendors: boolean;
  currency: string;

  // Address Tab
  address_1: string;
  address_2: string;
  state: string;
  zip_code: string;
  country: string;
  city: string;
  phone_1: string;
  phone_2: string;
  fax: string;

  // Contact Person Tab
  contact_persons: ISupplierContactPerson[];

  // Vendors (Airline / Hotel / Transport / Visa Agency / General tabs)
  vendors: ISupplierVendor[];

  // Quick-reference contact shown in lists (derived from Phone 1 / first contact person)
  contact_email: string;
  contact_phone: string;

  current_balance: number;
  created_by: Types.ObjectId;
  updated_by: Types.ObjectId;
  created_at: Date;
  updated_at: Date;
}

const SupplierSchema = new Schema<ISupplier>(
  {
    tenant_id: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },

    // General Information
    code: { type: String, default: "" },
    name: { type: String, required: true },
    short_name: { type: String, default: "" },
    details: { type: String, default: "" },

    // Account Information
    gl_account: { type: String, default: "201001" },
    credit_limit: { type: Number, default: null },
    create_auto_ledger: { type: Boolean, default: true },
    visible_to_all_branches: { type: Boolean, default: true },
    add_all_vendors: { type: Boolean, default: false },
    currency: { type: String, default: "PKR" },

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
    contact_persons: [
      {
        _id: false,
        name: { type: String, default: "" },
        designation: { type: String, default: "" },
        cell_phone: { type: String, default: "" },
        phone: { type: String, default: "" },
        fax: { type: String, default: "" },
        email: { type: String, default: "" },
      },
    ],

    // Vendors
    vendors: [
      {
        _id: false,
        category: { type: String, enum: SUPPLIER_VENDOR_CATEGORIES, required: true },
        title: { type: String, default: "" },
        details: { type: String, default: "" },
      },
    ],

    contact_email: { type: String, default: "" },
    contact_phone: { type: String, default: "" },

    current_balance: { type: Number, default: 0 },
    created_by: { type: Schema.Types.ObjectId, ref: "User" },
    updated_by: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

SupplierSchema.index({ tenant_id: 1, name: 1 });
SupplierSchema.index({ tenant_id: 1, code: 1 });

// In dev, hot reload keeps the previously compiled model; drop it so schema changes take effect.
if (process.env.NODE_ENV !== "production" && mongoose.models.Supplier) {
  mongoose.deleteModel("Supplier");
}

export default mongoose.models.Supplier || mongoose.model<ISupplier>("Supplier", SupplierSchema);
