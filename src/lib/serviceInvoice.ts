// Shared types, defaults, calculations and validation for non-ticket service
// invoices (Hotel, Transport, Visa, General/Other, plus Umrah/Hajj fallback).
// Used by the invoice UI and by server-side posting validation.

export interface PaxEntry {
  name: string;
  pax_type: string; // 'A' | 'C' | 'I'
}

export interface ServiceDetails {
  // Common
  template?: string;
  category?: string;
  booking_name?: string;
  reference_no?: string;
  remarks?: string;
  currency?: string;
  exc_rate?: string;
  apply_calculation?: boolean;

  // Charges (rates in selected currency)
  receivable_rate?: string;
  payable_rate?: string;
  other_charges?: string; // local currency, added to receivable
  discount?: string; // local currency, deducted from receivable

  // Hotel
  hotel_name?: string;
  hotel_city?: string;
  check_in?: string;
  check_out?: string;
  nights?: string;
  room_type?: string;
  room_view?: string;
  package?: string;
  costing_option?: string;
  inventory?: string;
  room_qty?: string;
  extra_bed_qty?: string;
  extra_bed_receivable_rate?: string;
  extra_bed_payable_rate?: string;
  booking_status?: string;

  // Transport
  transporter?: string;
  vehicle?: string;
  sector?: string;

  // Visa
  visa_pax_type?: string;
  visa_agency?: string;
  visa_type?: string;
  visa_apply_date?: string;
  visa_expiry_date?: string;

  // General / Other services
  vendor?: string;
  service_date?: string;
  com2_percent?: string;
  com2_amount?: string;
  wht_percent?: string;
  wht_amount?: string;

  // Local-currency totals (computed when auto update is on, manual otherwise)
  receivable_total_fc?: number;
  payable_total_fc?: number;
  receivable_total_lc?: string;
  payable_total_lc?: string;
}

export interface ServiceLineItem {
  service_type: string;
  description: string;
  amount: string;
  commission_override_rate: string;
  tax_code_id: string;
  pax_name?: string;
  pax_type?: string;
  supplier_id?: string;
  auto_update?: boolean;
  customer_gross?: number;
  customer_net?: number;
  supplier_gross?: number;
  supplier_net?: number;
  supplier_gross_wo_wht?: number;
  agency_margin?: number;
  service_details?: ServiceDetails;
  pax_list?: PaxEntry[];
}

export const SERVICE_LABELS: Record<string, string> = {
  Ticket: "Ticket",
  Hotel: "Hotel",
  Transport: "Transport",
  Visa: "Visa",
  Umrah: "Umrah",
  Hajj: "Hajj",
  Package: "Package",
  Other: "General",
};

export const DEFAULT_TEMPLATES: Record<string, string> = {
  Hotel: "Hotel Template",
  Transport: "Transport Template",
  Visa: "Visa Template",
  Umrah: "Umrah Template",
  Hajj: "Hajj Template",
  Package: "Package Template",
  Other: "INSURANCE",
};

export const CURRENCIES = ["PKR", "SAR", "USD", "AED", "EUR", "GBP"];
export const CATEGORIES = ["Visitor", "Umrah", "Hajj", "Tour", "Business", "Corporate"];
export const ROOM_TYPES = ["Single", "Double", "Triple", "Quad", "Quint", "Sharing", "Suite"];
export const ROOM_VIEWS = ["Standard", "City View", "Haram View", "Partial Haram View", "Kaaba View", "Sea View"];
export const BOOKING_STATUSES = ["Confirmed", "On Request", "Tentative", "Cancelled"];
export const COSTING_OPTIONS = ["Per Room / Night", "Per Person / Night", "Lump Sum"];
export const VEHICLES = ["Car / Sedan", "GMC", "H-1 / Staria", "Hiace", "Coaster", "Bus"];
export const TRANSPORT_SECTORS = [
  "JED Airport - Makkah",
  "Makkah - Madinah",
  "Madinah - Makkah",
  "Madinah - JED Airport",
  "Makkah - JED Airport",
  "MED Airport - Madinah",
  "Madinah - MED Airport",
  "Makkah Ziyarat",
  "Madinah Ziyarat",
];
export const VISA_TYPES = ["Umrah Visa", "Visit Visa", "Tourist Visa", "Business Visa", "Work Visa", "Transit Visa", "Hajj Visa"];
export const GENERAL_TEMPLATES = ["INSURANCE", "Ziyarat", "Meet & Assist", "Excess Baggage", "Other Service"];

const num = (v: unknown) => parseFloat(String(v ?? "0")) || 0;

const fmt = (n: number) => (n % 1 === 0 ? n.toString() : n.toFixed(2));

export function daysBetween(from?: string, to?: string): number {
  if (!from || !to) return 0;
  const a = new Date(from);
  const b = new Date(to);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
  return diff > 0 ? diff : 0;
}

export function paxCount(item: ServiceLineItem): number {
  const named = (item.pax_list || []).filter((p) => p.name && p.name.trim()).length;
  return Math.max(1, named);
}

/** Quantity multiplier applied to the rates, based on the service type and options. */
export function getQuantityFactor(item: ServiceLineItem): number {
  const d = item.service_details || {};
  if (d.apply_calculation === false) return 1;
  if (item.service_type === "Hotel") {
    const nights = Math.max(1, num(d.nights));
    if (d.costing_option === "Lump Sum") return 1;
    if (d.costing_option === "Per Person / Night") return nights * paxCount(item);
    return nights * Math.max(1, num(d.room_qty));
  }
  if (item.service_type === "Visa") return paxCount(item);
  return 1;
}

/** Extra bed multiplier (hotel only). */
export function getExtraBedFactor(item: ServiceLineItem): number {
  const d = item.service_details || {};
  if (item.service_type !== "Hotel") return 0;
  const beds = num(d.extra_bed_qty);
  if (beds <= 0) return 0;
  if (d.apply_calculation === false || d.costing_option === "Lump Sum") return beds;
  return beds * Math.max(1, num(d.nights));
}

function buildDescription(item: ServiceLineItem): string {
  const d = item.service_details || {};
  const pax = (item.pax_list || []).map((p) => p.name).filter(Boolean).join(", ");
  const parts: string[] = [];
  switch (item.service_type) {
    case "Hotel":
      parts.push(`Hotel: ${d.hotel_name || "-"}`);
      if (d.check_in || d.check_out) parts.push(`(${d.check_in || "?"} to ${d.check_out || "?"})`);
      if (d.room_type) parts.push(`${d.room_qty || 1} x ${d.room_type}`);
      break;
    case "Transport":
      parts.push(`Transport: ${d.vehicle || "-"}`);
      if (d.sector) parts.push(d.sector);
      break;
    case "Visa":
      parts.push(`Visa: ${d.visa_type || "-"}`);
      if (d.visa_agency) parts.push(`via ${d.visa_agency}`);
      break;
    default:
      parts.push(`${SERVICE_LABELS[item.service_type] || item.service_type}: ${d.template || "Service"}`);
  }
  if (pax) parts.push(`- ${pax}`);
  return parts.join(" ");
}

/** Recalculate receivable / payable / margin for a service line item. */
export function calculateServiceTotals<T extends ServiceLineItem>(item: T, lastEditedField?: string): T {
  const d: ServiceDetails = { ...(item.service_details || {}) };

  if (item.service_type === "Hotel") {
    d.nights = String(daysBetween(d.check_in, d.check_out));
  }

  const exc = num(d.exc_rate) || 1;
  const factor = getQuantityFactor(item);
  const bedFactor = getExtraBedFactor(item);

  const recFc = num(d.receivable_rate) * factor + num(d.extra_bed_receivable_rate) * bedFactor;
  const payFc = num(d.payable_rate) * factor + num(d.extra_bed_payable_rate) * bedFactor;
  d.receivable_total_fc = Math.round(recFc * 100) / 100;
  d.payable_total_fc = Math.round(payFc * 100) / 100;

  const autoUpdate = item.auto_update !== false;
  if (autoUpdate) {
    d.receivable_total_lc = String(Math.round(recFc * exc));
    d.payable_total_lc = String(Math.round(payFc * exc));
  }

  const recLc = num(d.receivable_total_lc);
  const payLc = num(d.payable_total_lc);

  // COM2 (commission from vendor on payable) and WHT on that commission
  let com2 = num(d.com2_amount);
  if (lastEditedField === "com2_amount") {
    d.com2_percent = payLc > 0 && com2 > 0 ? fmt((com2 / payLc) * 100) : "";
  } else if (num(d.com2_percent) > 0 || lastEditedField === "com2_percent") {
    com2 = (payLc * num(d.com2_percent)) / 100;
    d.com2_amount = fmt(Math.round(com2 * 100) / 100);
  }
  let wht = num(d.wht_amount);
  if (lastEditedField === "wht_amount") {
    d.wht_percent = com2 > 0 && wht > 0 ? fmt((wht / com2) * 100) : "";
  } else if (num(d.wht_percent) > 0 || lastEditedField === "wht_percent") {
    wht = (com2 * num(d.wht_percent)) / 100;
    d.wht_amount = fmt(Math.round(wht * 100) / 100);
  } else if (com2 === 0) {
    wht = 0;
    d.wht_amount = "0";
  }

  const customerGross = recLc + num(d.other_charges);
  const customerNet = customerGross - num(d.discount);
  const supplierGross = payLc;
  const supplierNet = supplierGross - com2 + wht;

  const next: T = {
    ...item,
    service_details: d,
    customer_gross: Math.round(customerGross),
    customer_net: Math.round(customerNet),
    supplier_gross: Math.round(supplierGross),
    supplier_net: Math.round(supplierNet),
    supplier_gross_wo_wht: Math.round(supplierGross - wht),
    agency_margin: Math.round(customerNet - supplierNet),
    amount: String(Math.round(customerNet)),
    pax_name: (item.pax_list || []).find((p) => p.name && p.name.trim())?.name || "",
    pax_type: (item.pax_list || [])[0]?.pax_type || "A",
  };
  next.description = buildDescription(next);
  return next;
}

export function createDefaultServiceItem(serviceType: string): ServiceLineItem {
  const today = new Date().toISOString().split("T")[0];
  const details: ServiceDetails = {
    template: DEFAULT_TEMPLATES[serviceType] || "New Template",
    category: serviceType === "Umrah" || serviceType === "Hajj" ? serviceType : "Visitor",
    booking_name: "Counter Sale",
    reference_no: "",
    remarks: "",
    currency: "PKR",
    exc_rate: "1",
    apply_calculation: true,
    receivable_rate: "",
    payable_rate: "",
    other_charges: "",
    discount: "",
    receivable_total_lc: "0",
    payable_total_lc: "0",
  };

  if (serviceType === "Hotel") {
    Object.assign(details, {
      hotel_name: "",
      hotel_city: "",
      check_in: "",
      check_out: "",
      nights: "0",
      room_type: "",
      room_view: "",
      package: "",
      costing_option: "Per Room / Night",
      inventory: "",
      room_qty: "1",
      extra_bed_qty: "0",
      extra_bed_receivable_rate: "",
      extra_bed_payable_rate: "",
      booking_status: "Confirmed",
    });
  } else if (serviceType === "Transport") {
    Object.assign(details, { transporter: "", vehicle: "", sector: "", package: "", inventory: "" });
  } else if (serviceType === "Visa") {
    Object.assign(details, {
      visa_pax_type: "A",
      visa_agency: "",
      visa_type: "",
      visa_apply_date: today,
      visa_expiry_date: "",
    });
  } else {
    Object.assign(details, {
      vendor: "",
      service_date: today,
      com2_percent: "",
      com2_amount: "",
      wht_percent: "12",
      wht_amount: "",
    });
  }

  return {
    service_type: serviceType,
    description: "",
    amount: "0",
    commission_override_rate: "",
    tax_code_id: "",
    pax_name: "",
    pax_type: "A",
    supplier_id: "",
    auto_update: true,
    customer_gross: 0,
    customer_net: 0,
    supplier_gross: 0,
    supplier_net: 0,
    supplier_gross_wo_wht: 0,
    agency_margin: 0,
    service_details: details,
    pax_list: [{ name: "", pax_type: "A" }],
  };
}

/** Convert a stored (API) line item into the editable form shape. */
export function fromStoredServiceItem(li: Record<string, unknown>): ServiceLineItem {
  const serviceType = String(li.service_type || "Other");
  const base = createDefaultServiceItem(serviceType);
  const stored = (li.service_details && typeof li.service_details === "object" ? li.service_details : {}) as ServiceDetails;
  const paxList = Array.isArray(li.pax_list)
    ? (li.pax_list as PaxEntry[]).map((p) => ({ name: String(p.name || ""), pax_type: String(p.pax_type || "A") }))
    : [];
  const supplier =
    li.supplier_id && typeof li.supplier_id === "object" && "_id" in (li.supplier_id as object)
      ? String((li.supplier_id as { _id: unknown })._id)
      : String(li.supplier_id || "");

  return {
    ...base,
    description: String(li.description || ""),
    amount: String(li.amount ?? "0"),
    commission_override_rate: li.commission_override_rate ? String(li.commission_override_rate) : "",
    supplier_id: supplier,
    auto_update: li.auto_update !== undefined ? Boolean(li.auto_update) : true,
    pax_name: String(li.pax_name || ""),
    pax_type: String(li.pax_type || "A"),
    customer_gross: Number(li.customer_gross) || 0,
    customer_net: Number(li.customer_net) || Number(li.amount) || 0,
    supplier_gross: Number(li.supplier_gross) || 0,
    supplier_net: Number(li.supplier_net) || 0,
    supplier_gross_wo_wht: Number(li.supplier_gross_wo_wht) || 0,
    agency_margin: Number(li.agency_margin) || 0,
    service_details: { ...base.service_details, ...stored },
    pax_list: paxList.length > 0 ? paxList : base.pax_list,
  };
}

const blank = (v: unknown) => !v || !String(v).trim();

/** Compulsory (*) field checks for posting a non-ticket service line item. */
export function validateServiceItemForPosting(item: ServiceLineItem, label: string): string[] {
  const errors: string[] = [];
  const d = item.service_details || {};
  const req = (value: unknown, name: string) => {
    if (blank(value)) errors.push(`${label}: ${name} is missing`);
  };

  req(d.template, "Template");
  req(item.supplier_id, "Supplier");
  req(d.category, "Category");

  switch (item.service_type) {
    case "Hotel":
      req(d.check_in, "Check-in Date");
      req(d.check_out, "Check-out Date");
      if (d.check_in && d.check_out && daysBetween(d.check_in, d.check_out) <= 0) {
        errors.push(`${label}: Check-out Date must be after Check-in Date`);
      }
      req(d.hotel_name, "Hotel");
      req(d.room_type, "Room");
      req(d.room_view, "Room View");
      req(d.currency, "Currency");
      req(d.costing_option, "Costing Option");
      if (num(d.room_qty) <= 0) errors.push(`${label}: Room Qty is missing`);
      req(d.booking_status, "Booking Status");
      req(d.booking_name, "Booking Name");
      break;
    case "Transport":
      req(d.transporter, "Transporter");
      req(d.vehicle, "Vehicle");
      req(d.currency, "Currency");
      req(d.booking_name, "Booking Name");
      break;
    case "Visa":
      req(d.visa_pax_type, "Pax Type");
      req(d.visa_agency, "Visa Agency");
      req(d.currency, "Currency");
      break;
    default:
      if (!(item.pax_list || []).some((p) => !blank(p.name))) errors.push(`${label}: Pax is missing`);
      req(d.vendor, "Vendor");
      req(d.service_date, "Date");
  }

  return errors;
}
