// Bulk invoice upload (TS-0040): one spreadsheet template per invoice type. One row per
// ticket / service item; rows sharing an "Invoice Ref" become one invoice.

import { ColumnDef, RowValues } from "./columns";
import {
  BOOKING_STATUSES,
  CATEGORIES,
  COSTING_OPTIONS,
  CURRENCIES,
  GENERAL_TEMPLATES,
  ROOM_TYPES,
  ROOM_VIEWS,
  VEHICLES,
  VISA_TYPES,
  calculateServiceTotals,
  createDefaultServiceItem,
  ServiceLineItem,
} from "@/lib/serviceInvoice";
import { calculateTicketTotals } from "@/lib/ticketCalc";
import { formatTicketNumber, getAirlineByTicketNumber, IATA_AIRLINES } from "@/lib/iataAirlines";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Invoice types that have their own list page (and therefore their own template). */
export const UPLOAD_INVOICE_TYPES = ["Ticket", "Hotel", "Transport", "Umrah", "Hajj", "Visa", "Other"] as const;
export type UploadInvoiceType = (typeof UPLOAD_INVOICE_TYPES)[number];

export const UPLOAD_TYPE_LABELS: Record<UploadInvoiceType, string> = {
  Ticket: "Ticket",
  Hotel: "Hotel",
  Transport: "Transport",
  Umrah: "Umrah",
  Hajj: "Hajj",
  Visa: "Visa",
  Other: "Others",
};

const VISIT_TYPES = ["Visitor", "Corporate", "Government", "Walk-in"] as const;
const PAY_MODES = ["CR", "Cash", "Bank", "Cheque", "Card"] as const;
const PAX_TYPES = ["A", "C", "I"] as const;
const GDS = ["Amadeus", "Sabre", "Galileo", "Worldspan", "Direct"] as const;
const DOC_TYPES = ["BSPD", "E-Ticket", "MCO"] as const;
const TRIP_TYPES = ["International", "Domestic"] as const;

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

const INVOICE_COLUMNS: ColumnDef[] = [
  { key: "invoice_ref", header: "Invoice Ref", required: true, note: "Rows with the same Invoice Ref become one invoice", width: 14 },
  { key: "customer_code", header: "Customer Code", required: true, note: "e.g. CUS-1 (see Customers)", width: 16 },
  { key: "print_name", header: "Print Name", required: true, width: 22 },
  { key: "visit_type", header: "Visit Type", required: true, options: VISIT_TYPES },
  { key: "payment_mode", header: "Pay Mode", required: true, options: PAY_MODES },
  { key: "currency", header: "Invoice Currency", options: CURRENCIES, note: "Defaults to your base currency" },
  { key: "custom_invoice_number", header: "Custom Invoice No." },
  { key: "spo_email", header: "SPO / Agent Email", note: "Email of the team member; blank = none", width: 22 },
  { key: "internal_remarks", header: "Internal Remarks", note: "Never printed", width: 24 },
];

const SEGMENTS = 4;
const segmentColumns: ColumnDef[] = Array.from({ length: SEGMENTS }).flatMap((_, i) => {
  const n = i + 1;
  return [
    { key: `seg${n}_city`, header: `Leg ${n} City`, note: "3-letter IATA code" },
    { key: `seg${n}_flight`, header: `Leg ${n} Flight No` },
    { key: `seg${n}_class`, header: `Leg ${n} Class` },
    { key: `seg${n}_dep_date`, header: `Leg ${n} Dep Date`, kind: "date" as const },
    { key: `seg${n}_dep_time`, header: `Leg ${n} Dep Time`, kind: "time" as const },
    { key: `seg${n}_arr_time`, header: `Leg ${n} Arr Time`, kind: "time" as const },
  ];
});

// Hard-coded ticket tax fields (configurable tax codes are paused)
const TICKET_TAXES: Array<[string, string]> = [
  ["tax_sp", "SP"], ["tax_rg", "RG"], ["tax_pk", "PK"], ["tax_yr", "YR"], ["tax_yq", "YQ"],
  ["tax_dof", "DOF"], ["tax_xz", "XZ"], ["tax_yd", "YD"], ["tax_yi", "YI"], ["tax_rn", "RN"],
  ["tax_apt", "APT"], ["tax_kbr", "KBR"], ["tax_kbp", "KBP"], ["tax_pb", "PB"], ["tax_ced", "CED"],
  ["tax_gst_dom", "GST (Domestic)"], ["tax_ast", "AST"], ["other_taxes", "Other Taxes"],
];

const TICKET_PERCENTS: Array<[string, string]> = [
  ["commission_percent", "COM %"], ["wht_percent", "WHT %"], ["discount_percent", "DIS %"],
  ["discount2_percent", "DIS2 %"], ["psf_percent", "PSF %"], ["psf_p_percent", "PSF/P %"],
  ["gst_percent", "GST %"], ["seg_percent", "SEG %"], ["wht_c_percent", "WHT_C %"],
];

const TICKET_COLUMNS: ColumnDef[] = [
  ...INVOICE_COLUMNS,
  { key: "pax_name", header: "Pax Name", required: true, width: 24 },
  { key: "pax_type", header: "Pax Type", required: true, options: PAX_TYPES, note: "A = Adult, C = Child, I = Infant" },
  { key: "ticket_number", header: "Ticket No.", required: true, note: "13 digits, e.g. 157-3652-123-654", width: 18 },
  { key: "airline", header: "Airline", required: true, derivable: true, note: "Name or 3-digit code; blank = taken from the ticket number", width: 20 },
  { key: "supplier_code", header: "Supplier Code", required: true, width: 16 },
  { key: "sector", header: "Sector", required: true, note: "e.g. LHE-DXB-LHE", width: 16 },
  { key: "doc_type", header: "Doc", required: true, options: DOC_TYPES },
  { key: "trip_type", header: "Type", required: true, options: TRIP_TYPES },
  { key: "gds_pnr", header: "PNR" },
  { key: "gds_name", header: "GDS", options: GDS },
  { key: "passport_no", header: "PP No." },
  { key: "passport_issue_date", header: "PP Issue Date", kind: "date" },
  { key: "issue_date", header: "Issue Date", kind: "date" },
  { key: "tour_code", header: "Tour Code" },
  { key: "conjunction_ticket_no", header: "Conjunction Ticket No." },
  ...segmentColumns,
  { key: "base_fare", header: "Base Fare", kind: "number" },
  ...TICKET_TAXES.map(([key, header]) => ({ key, header, kind: "number" as const })),
  { key: "xt_amount", header: "Airline Tax (XT)", kind: "number" },
  { key: "city_tax_amount", header: "City Tax", kind: "number" },
  ...TICKET_PERCENTS.map(([key, header]) => ({ key, header, kind: "number" as const })),
  { key: "customer_remarks", header: "Customer Remarks", note: "Printed on the invoice", width: 24 },
];

// Service invoices (Hotel / Transport / Visa / Umrah / Hajj / Others)
const SERVICE_COMMON_START: ColumnDef[] = [
  ...INVOICE_COLUMNS,
  { key: "supplier_code", header: "Supplier Code", required: true, width: 16 },
];

const chargeColumns = (opts: { extraBed?: boolean } = {}): ColumnDef[] => [
  { key: "service_currency", header: "Currency", required: true, options: CURRENCIES },
  { key: "exc_rate", header: "Exchange Rate", kind: "number", note: "Blank = 1" },
  { key: "receivable_rate", header: "Receivable Rate", kind: "number" },
  { key: "payable_rate", header: "Payable Rate", kind: "number" },
  ...(opts.extraBed
    ? [
        { key: "extra_bed_receivable_rate", header: "Extra Bed Rec. Rate", kind: "number" as const },
        { key: "extra_bed_payable_rate", header: "Extra Bed Pay. Rate", kind: "number" as const },
      ]
    : []),
  { key: "other_charges", header: "Other Charges", kind: "number" },
  { key: "discount", header: "Discount", kind: "number" },
  { key: "com2_percent", header: "COM2 %", kind: "number" },
  { key: "service_wht_percent", header: "WHT %", kind: "number" },
];

const tailColumns = (opts: { bookingName: boolean; paxRequired?: boolean }): ColumnDef[] => [
  { key: "category", header: "Category", required: true, options: CATEGORIES },
  ...(opts.bookingName ? [{ key: "booking_name", header: "Booking Name", required: true, width: 18 }] : []),
  { key: "tax_code", header: "Tax Code", note: "Code from Tax Codes; blank = none" },
  { key: "reference_no", header: "Reference No." },
  { key: "pax_names", header: "Pax Names", required: !!opts.paxRequired, note: "Separate several names with ;", width: 28 },
  { key: "pax_type", header: "Pax Type", options: PAX_TYPES, note: "Applies to every name; blank = A" },
  { key: "remarks", header: "Remarks", note: "Printed on the invoice", width: 24 },
];

const HOTEL_COLUMNS: ColumnDef[] = [
  ...SERVICE_COMMON_START,
  { key: "template", header: "Template", required: true },
  { key: "check_in", header: "Check-in Date", required: true, kind: "date" },
  { key: "check_out", header: "Check-out Date", required: true, kind: "date" },
  { key: "hotel_name", header: "Hotel", required: true, width: 22 },
  { key: "hotel_city", header: "City" },
  { key: "room_type", header: "Room", required: true, options: ROOM_TYPES },
  { key: "room_view", header: "Room View", required: true, options: ROOM_VIEWS },
  { key: "package", header: "Packages", note: "e.g. BB / HB / FB" },
  { key: "costing_option", header: "Costing Option", required: true, options: COSTING_OPTIONS },
  { key: "inventory", header: "Inventory" },
  { key: "room_qty", header: "Room Qty", required: true, kind: "number" },
  { key: "extra_bed_qty", header: "Extra Bed Qty", kind: "number" },
  { key: "booking_status", header: "Booking Status", required: true, options: BOOKING_STATUSES },
  ...chargeColumns({ extraBed: true }),
  ...tailColumns({ bookingName: true }),
];

const TRANSPORT_COLUMNS: ColumnDef[] = [
  ...SERVICE_COMMON_START,
  { key: "template", header: "Template", required: true },
  { key: "transporter", header: "Transporter", required: true, width: 20 },
  { key: "vehicle", header: "Vehicle", required: true, options: VEHICLES },
  { key: "sector", header: "Sector", width: 20 },
  { key: "package", header: "Package" },
  { key: "inventory", header: "Inventory" },
  ...chargeColumns(),
  ...tailColumns({ bookingName: true }),
];

const VISA_COLUMNS: ColumnDef[] = [
  ...SERVICE_COMMON_START,
  { key: "template", header: "Template", required: true },
  { key: "visa_pax_type", header: "Visa Pax Type", required: true, options: PAX_TYPES },
  { key: "visa_agency", header: "Visa Agency", required: true, width: 20 },
  { key: "visa_type", header: "Visa Type", options: VISA_TYPES },
  { key: "visa_apply_date", header: "Visa Apply Date", kind: "date" },
  { key: "visa_expiry_date", header: "Visa Expiry Date", kind: "date" },
  ...chargeColumns(),
  ...tailColumns({ bookingName: false }),
];

const generalColumns = (templateOptions?: readonly string[]): ColumnDef[] => [
  ...SERVICE_COMMON_START,
  { key: "template", header: "Template / Service", required: true, options: templateOptions },
  { key: "vendor", header: "Vendor", required: true, width: 20 },
  { key: "service_date", header: "Date", required: true, kind: "date" },
  ...chargeColumns(),
  ...tailColumns({ bookingName: false, paxRequired: true }),
];

export const INVOICE_TEMPLATE_COLUMNS: Record<UploadInvoiceType, ColumnDef[]> = {
  Ticket: TICKET_COLUMNS,
  Hotel: HOTEL_COLUMNS,
  Transport: TRANSPORT_COLUMNS,
  Visa: VISA_COLUMNS,
  Umrah: generalColumns(),
  Hajj: generalColumns(),
  Other: generalColumns(GENERAL_TEMPLATES),
};

/** Columns read once per invoice (from the group's first row). */
export const INVOICE_LEVEL_KEYS = INVOICE_COLUMNS.map((c) => c.key);

// ---------------------------------------------------------------------------
// Row → invoice line item
// ---------------------------------------------------------------------------

export interface LineLookups {
  supplierId: string;
  taxCodeId?: string;
}

const n = (v: string | undefined) => (v && v.trim() ? v.trim() : "0");

function resolveAirline(row: RowValues, ticketNumber: string): { airline_name: string; airline_code: string } {
  const given = (row.airline || "").trim();
  if (given) {
    const byCode = IATA_AIRLINES[given];
    if (byCode) return { airline_name: byCode.name, airline_code: byCode.code };
    const byName = Object.values(IATA_AIRLINES).find((a) => a.name.toLowerCase() === given.toLowerCase() || a.iata2.toLowerCase() === given.toLowerCase());
    if (byName) return { airline_name: byName.name, airline_code: byName.code };
    return { airline_name: given, airline_code: "" };
  }
  const fromTicket = getAirlineByTicketNumber(ticketNumber);
  return fromTicket ? { airline_name: fromTicket.name, airline_code: fromTicket.code } : { airline_name: "", airline_code: "" };
}

export function buildTicketItem(row: RowValues, lookups: LineLookups): Record<string, any> {
  const ticket_number = formatTicketNumber(row.ticket_number || "");
  const segments = Array.from({ length: SEGMENTS })
    .map((_, i) => {
      const k = i + 1;
      return {
        city: (row[`seg${k}_city`] || "").toUpperCase(),
        flight_no: row[`seg${k}_flight`] || "",
        booking_class: row[`seg${k}_class`] || "Y",
        dep_date: row[`seg${k}_dep_date`] || "",
        dep_time: row[`seg${k}_dep_time`] || "",
        arr_time: row[`seg${k}_arr_time`] || "",
      };
    })
    .filter((s) => s.city || s.flight_no || s.dep_date);

  const item: Record<string, any> = {
    service_type: "Ticket",
    description: "",
    amount: "0",
    commission_override_rate: "",
    tax_code_id: "",
    pax_name: row.pax_name,
    pax_type: row.pax_type || "A",
    passport_no: row.passport_no || "",
    passport_issue_date: row.passport_issue_date || "",
    ticket_number,
    conjunction_ticket_no: row.conjunction_ticket_no ? formatTicketNumber(row.conjunction_ticket_no) : "",
    gds_pnr: (row.gds_pnr || "").toUpperCase(),
    gds_name: row.gds_name || "Amadeus",
    ...resolveAirline(row, ticket_number),
    sector: (row.sector || "").toUpperCase(),
    trip_type: row.trip_type || "International",
    doc_type: row.doc_type || "BSPD",
    tour_code: row.tour_code || "",
    issue_date: row.issue_date || new Date().toISOString().split("T")[0],
    customer_remarks: row.customer_remarks || "",
    supplier_id: lookups.supplierId,
    flight_segments: segments,
    airline_city_taxes: [{ code: "XT", amount: n(row.xt_amount) }],
    city_taxes: [{ code: "City Tax", amount: n(row.city_tax_amount) }],
    base_fare: n(row.base_fare),
    auto_update: true,
  };
  for (const [key] of TICKET_TAXES) item[key] = n(row[key]);
  for (const [key] of TICKET_PERCENTS) {
    item[key] = n(row[key]);
    item[key.replace("_percent", "_amount")] = "0";
  }
  return calculateTicketTotals(item);
}

export function buildServiceItem(type: UploadInvoiceType, row: RowValues, lookups: LineLookups): ServiceLineItem {
  const base = createDefaultServiceItem(type);
  const d = { ...(base.service_details || {}) } as Record<string, any>;
  const set = (key: string, value = row[key]) => {
    if (value !== undefined && value !== "") d[key] = value;
  };
  [
    "template", "check_in", "check_out", "hotel_name", "hotel_city", "room_type", "room_view", "package",
    "costing_option", "inventory", "room_qty", "extra_bed_qty", "booking_status", "transporter", "vehicle",
    "sector", "visa_pax_type", "visa_agency", "visa_type", "visa_apply_date", "visa_expiry_date", "vendor",
    "service_date", "category", "booking_name", "reference_no", "remarks", "exc_rate", "receivable_rate",
    "payable_rate", "extra_bed_receivable_rate", "extra_bed_payable_rate", "other_charges", "discount",
    "com2_percent",
  ].forEach((k) => set(k));
  set("currency", row.service_currency);
  set("wht_percent", row.service_wht_percent);
  if (!d.exc_rate) d.exc_rate = "1";

  const paxType = row.pax_type || "A";
  const pax_list = (row.pax_names || "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name, pax_type: paxType }));

  const item: ServiceLineItem = {
    ...base,
    supplier_id: lookups.supplierId,
    tax_code_id: lookups.taxCodeId || "",
    pax_list: pax_list.length ? pax_list : base.pax_list,
    service_details: d,
  };
  return calculateServiceTotals(item);
}
