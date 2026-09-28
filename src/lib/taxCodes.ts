// Invoice types a tax code can be tagged for, and helpers to decide which tax
// codes are offered on a given invoice. Shared by the Tax Codes screen, the
// invoice screens and the tax-code API.

export const INVOICE_TYPES = ["Ticket", "Hotel", "Umrah", "Hajj", "Visa", "Transport", "Insurance", "General"] as const;
export type InvoiceType = (typeof INVOICE_TYPES)[number];

export function isInvoiceType(v: unknown): v is InvoiceType {
  return typeof v === "string" && (INVOICE_TYPES as readonly string[]).includes(v);
}

/** Keep only known invoice types, de-duplicated, in canonical order. */
export function normalizeInvoiceTypes(v: unknown): InvoiceType[] {
  const list = Array.isArray(v) ? v : [];
  return INVOICE_TYPES.filter((t) => list.includes(t));
}

/**
 * Map a line item's service type to its invoice type. General ("Other") service
 * invoices using the INSURANCE template count as Insurance invoices.
 */
export function invoiceTypeOf(serviceType: string, template?: string): InvoiceType {
  if (serviceType === "Other" || serviceType === "Package") {
    return String(template || "").trim().toUpperCase() === "INSURANCE" ? "Insurance" : "General";
  }
  return isInvoiceType(serviceType) ? serviceType : "General";
}

/** Display label for a tax code in pickers: "CODE — Name", or just the code when unnamed. */
export function taxCodeLabel(t: { code?: string; name?: string }): string {
  const code = String(t.code || "").trim();
  const name = String(t.name || "").trim();
  return name ? `${code} — ${name}` : code;
}

export interface TaggableTaxCode {
  _id: string;
  active: boolean;
  applicable_invoice_types?: string[];
}

/**
 * Active tax codes selectable on the given invoice type. A tax code with no
 * tagged types (created before tagging existed) stays available everywhere.
 */
export function taxCodesForInvoiceType<T extends TaggableTaxCode>(codes: T[], type: InvoiceType): T[] {
  return codes.filter((t) => {
    if (!t.active) return false;
    const types = t.applicable_invoice_types || [];
    return types.length === 0 || types.includes(type);
  });
}
