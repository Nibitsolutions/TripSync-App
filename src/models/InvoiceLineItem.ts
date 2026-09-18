import mongoose, { Schema, Document, Types } from "mongoose";

export type ServiceType = "Ticket" | "Hotel" | "Package" | "Umrah" | "Visa" | "Other";

export interface IFlightSegment {
  city: string;
  flight_no: string;
  booking_class: string;
  dep_date: string;
  arr_date?: string;
  dep_time: string;
  arr_time: string;
  fare_basis: string;
}

export interface IInvoiceLineItem extends Document {
  invoice_id: Types.ObjectId;
  tenant_id: Types.ObjectId;
  service_type: ServiceType;
  description: string;
  amount: number;
  tax_code_id: Types.ObjectId | null;
  commission_id: Types.ObjectId | null;
  booking_reference: string | null;
  commission_override_rate: number | null;
  
  // Passenger & Airline Details
  pax_name: string;
  pax_type: string; // 'A' | 'C' | 'I'
  passport_no: string;
  passport_issue_date: string;
  ticket_number: string;
  conjunction_ticket_no: string;
  conjunction_route: string;
  conjunction_city: string;
  conjunction_flight_no: string;
  conjunction_booking_class: string;
  conjunction_dep_date: string;
  conjunction_arr_date?: string;
  conjunction_dep_time: string;
  conjunction_arr_time: string;
  gds_pnr: string;
  gds_name: string;
  airline_name: string;
  airline_code: string;
  sector: string;
  trip_type: string; // 'International' | 'Domestic'
  doc_type: string; // 'BSPD' | 'E-Ticket'
  tour_code: string;
  issue_date: string;
  customer_remarks: string;
  our_xo: string;
  
  // Flight Segments
  flight_segments: IFlightSegment[];
  
  // Airfare & IATA Taxes
  base_fare: number;
  tax_sp: number;
  tax_dof: number;
  tax_yq: number;
  tax_yr: number;
  tax_rg: number;
  tax_pk: number;
  tax_apt: number;
  tax_kbr: number;
  tax_kbp: number;
  tax_pb: number;
  tax_xz: number;
  tax_yd: number;
  tax_yi: number;
  tax_rn: number;
  tax_city: number;
  tax_airline_city: number;
  other_taxes: number;
  tax_ced: number;
  tax_gst_dom: number;
  tax_ast: number;
  airline_city_taxes: Array<{ code: string; amount: number }>;
  city_taxes: Array<{ code: string; amount: number }>;
  
  // Commercials & Deductions
  wht_percent: number;
  wht_amount: number;
  commission_percent: number;
  commission_amount: number;
  discount_percent: number;
  discount_amount: number;
  discount2_percent: number;
  discount2_amount: number;
  psf_p_percent: number;
  psf_p_amount: number;
  psf_percent: number;
  psf_amount: number;
  gst_percent: number;
  gst_amount: number;
  seg_percent: number;
  seg_amount: number;
  wht_c_percent: number;
  wht_c_amount: number;
  auto_update: boolean;
  cancellation_charges_self: number;
  cancellation_charges_supplier: number;
  
  // Accounting Summary
  supplier_id: Types.ObjectId | null;
  customer_gross: number;
  customer_net: number;
  supplier_gross: number;
  supplier_net: number;
  supplier_gross_wo_wht: number;
  agency_margin: number;

  created_at: Date;
  updated_at: Date;
}

const InvoiceLineItemSchema = new Schema<IInvoiceLineItem>(
  {
    invoice_id: { type: Schema.Types.ObjectId, ref: "Invoice", required: true, index: true },
    tenant_id: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    service_type: { type: String, enum: ["Ticket", "Hotel", "Package", "Umrah", "Visa", "Other"], required: true },
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    tax_code_id: { type: Schema.Types.ObjectId, ref: "TaxCode", default: null },
    commission_id: { type: Schema.Types.ObjectId, ref: "Commission", default: null },
    booking_reference: { type: String, default: null },
    commission_override_rate: { type: Number, default: null },

    // Passenger & Airline Details
    pax_name: { type: String, default: "" },
    pax_type: { type: String, default: "A" },
    passport_no: { type: String, default: "" },
    passport_issue_date: { type: String, default: "" },
    ticket_number: { type: String, default: "" },
    conjunction_ticket_no: { type: String, default: "" },
    conjunction_route: { type: String, default: "" },
    conjunction_city: { type: String, default: "" },
    conjunction_flight_no: { type: String, default: "" },
    conjunction_booking_class: { type: String, default: "" },
    conjunction_dep_date: { type: String, default: "" },
    conjunction_arr_date: { type: String, default: "" },
    conjunction_dep_time: { type: String, default: "" },
    conjunction_arr_time: { type: String, default: "" },
    gds_pnr: { type: String, default: "" },
    gds_name: { type: String, default: "" },
    airline_name: { type: String, default: "" },
    airline_code: { type: String, default: "" },
    sector: { type: String, default: "" },
    trip_type: { type: String, default: "International" },
    doc_type: { type: String, default: "BSPD" },
    tour_code: { type: String, default: "" },
    issue_date: { type: String, default: "" },
    customer_remarks: { type: String, default: "" },
    our_xo: { type: String, default: "" },

    // Flight Segments
    flight_segments: [
      {
        city: { type: String, default: "" },
        flight_no: { type: String, default: "" },
        booking_class: { type: String, default: "" },
        dep_date: { type: String, default: "" },
        arr_date: { type: String, default: "" },
        dep_time: { type: String, default: "" },
        arr_time: { type: String, default: "" },
        fare_basis: { type: String, default: "" },
      },
    ],

    // Airfare & IATA Taxes
    base_fare: { type: Number, default: 0 },
    tax_sp: { type: Number, default: 0 },
    tax_dof: { type: Number, default: 0 },
    tax_yq: { type: Number, default: 0 },
    tax_yr: { type: Number, default: 0 },
    tax_rg: { type: Number, default: 0 },
    tax_pk: { type: Number, default: 0 },
    tax_apt: { type: Number, default: 0 },
    tax_kbr: { type: Number, default: 0 },
    tax_kbp: { type: Number, default: 0 },
    tax_pb: { type: Number, default: 0 },
    tax_xz: { type: Number, default: 0 },
    tax_yd: { type: Number, default: 0 },
    tax_yi: { type: Number, default: 0 },
    tax_rn: { type: Number, default: 0 },
    tax_city: { type: Number, default: 0 },
    tax_airline_city: { type: Number, default: 0 },
    other_taxes: { type: Number, default: 0 },
    tax_ced: { type: Number, default: 0 },
    tax_gst_dom: { type: Number, default: 0 },
    tax_ast: { type: Number, default: 0 },
    airline_city_taxes: [
      {
        code: { type: String, default: "XT" },
        amount: { type: Number, default: 0 },
      },
    ],
    city_taxes: [
      {
        code: { type: String, default: "" },
        amount: { type: Number, default: 0 },
      },
    ],

    // Commercials & Deductions
    wht_percent: { type: Number, default: 0 },
    wht_amount: { type: Number, default: 0 },
    commission_percent: { type: Number, default: 0 },
    commission_amount: { type: Number, default: 0 },
    discount_percent: { type: Number, default: 0 },
    discount_amount: { type: Number, default: 0 },
    discount2_percent: { type: Number, default: 0 },
    discount2_amount: { type: Number, default: 0 },
    psf_p_percent: { type: Number, default: 0 },
    psf_p_amount: { type: Number, default: 0 },
    psf_percent: { type: Number, default: 0 },
    psf_amount: { type: Number, default: 0 },
    gst_percent: { type: Number, default: 0 },
    gst_amount: { type: Number, default: 0 },
    seg_percent: { type: Number, default: 0 },
    seg_amount: { type: Number, default: 0 },
    wht_c_percent: { type: Number, default: 0 },
    wht_c_amount: { type: Number, default: 0 },
    auto_update: { type: Boolean, default: true },
    cancellation_charges_self: { type: Number, default: 0 },
    cancellation_charges_supplier: { type: Number, default: 0 },

    // Accounting Summary
    supplier_id: { type: Schema.Types.ObjectId, ref: "Supplier", default: null },
    customer_gross: { type: Number, default: 0 },
    customer_net: { type: Number, default: 0 },
    supplier_gross: { type: Number, default: 0 },
    supplier_net: { type: Number, default: 0 },
    supplier_gross_wo_wht: { type: Number, default: 0 },
    agency_margin: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export default mongoose.models.InvoiceLineItem || mongoose.model<IInvoiceLineItem>("InvoiceLineItem", InvoiceLineItemSchema);
