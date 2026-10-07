// Ticket fare / tax / commission arithmetic. Shared by the ticket invoice screen, the
// invoice API (which recomputes on every save) and spreadsheet bulk upload, so every path
// produces identical, balanced totals.
//
// Accounting treatment of each field:
//   COM          our income, received from the supplier (reduces what we pay them)
//   DIS, DIS2    discounts to the customer (reduce what the customer pays)
//   PSF/P        payable to the supplier (charged to the customer)
//   PSF          our income (charged to the customer)
//   GST          payable to FBR, pass-through (charged to the customer, never income)
//   WHT          payable to the supplier
//   WHT_C        receivable from the customer
//   Airline Tax  (XT rows) payable to the supplier
//   City Tax     our income (charged to the customer)
//   SEG          payable to the supplier
//   SP, RG, YQ … (IATA / domestic grid taxes) collected for the airline: payable to the supplier
//
// Every percentage is a percentage of the Base Fare; each field can be entered as % or as an
// amount and the other side is kept in sync.
//
// Results (all to the paisa, computed in integer paisa so they always balance):
//   Customer Gross   = Base Fare + supplier taxes + City Tax + PSF/P + GST + WHT_C + PSF + SEG
//   Customer Net     = Customer Gross − DIS − DIS2
//   Supplier Payable = Base Fare − COM + PSF/P + WHT + supplier taxes + SEG
//   FBR Payable      = GST
//   Agency Profit    = COM + PSF + City Tax + (WHT_C − WHT) − DIS − DIS2
//   Customer Net − Supplier Payable − FBR Payable = Agency Profit

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TicketCalcInput {
  base_fare?: string;
  trip_type?: string;
  airline_city_taxes?: { code?: string; amount?: string }[];
  city_taxes?: { code?: string; amount?: string }[];
  /** Per pair (keyed by its amount field): whether the user entered the % or the amount. */
  entry_modes?: Record<string, EntryMode>;
  [key: string]: any;
}

export type EntryMode = "pct" | "amt";

export interface TicketTotals {
  customer_gross: number;
  customer_net: number;
  supplier_gross: number;
  supplier_net: number;
  supplier_gross_wo_wht: number;
  fbr_payable: number;
  agency_margin: number;
  amount: string;
}

/** IATA / airline grid taxes per trip type; all are collected for the airline (supplier side). */
export const INTERNATIONAL_GRID_TAXES = [
  "tax_sp", "tax_rg", "tax_pk", "tax_yr", "tax_yq", "tax_dof", "tax_xz", "tax_yd", "tax_yi", "tax_rn",
  "tax_apt", "tax_kbr", "tax_kbp", "tax_pb", "other_taxes",
] as const;
export const DOMESTIC_GRID_TAXES = [
  "tax_sp", "tax_ced", "tax_pk", "tax_yr", "tax_pb", "tax_yq", "tax_dof", "tax_xz", "tax_yd", "tax_yi",
  "tax_rn", "tax_gst_dom", "tax_ast", "tax_apt", "other_taxes",
] as const;

/** Percentage / amount pairs, all based on the Base Fare. */
const PAIRS = [
  ["commission_percent", "commission_amount"],
  ["discount_percent", "discount_amount"],
  ["discount2_percent", "discount2_amount"],
  ["psf_p_percent", "psf_p_amount"],
  ["psf_percent", "psf_amount"],
  ["gst_percent", "gst_amount"],
  ["wht_percent", "wht_amount"],
  ["wht_c_percent", "wht_c_amount"],
  ["seg_percent", "seg_amount"],
] as const;

const toNum = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
/** Money → integer paisa (half away from zero). */
const paisa = (v: unknown) => {
  const n = toNum(v);
  return Math.sign(n) * Math.round(Math.abs(n) * 100);
};
const rupees = (p: number) => p / 100;
const fmtAmount = (p: number) => (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2));
const fmtPercent = (pct: number) => String(Math.round(pct * 10000) / 10000);

/**
 * Recompute a ticket line's tax amounts and totals.
 * @param lastEditedField the field the user just changed: if it is a % the amount follows,
 *   if it is an amount the % follows.
 * @param options.preferAmounts when no field was just edited, treat entered amounts as the
 *   source of truth (used when saving, so a stored amount is never altered by % rounding).
 */
export function calculateTicketTotals<T extends TicketCalcInput>(
  item: T,
  lastEditedField?: string,
  options: { preferAmounts?: boolean } = {}
): T & TicketTotals {
  const updated: Record<string, any> = { ...item };
  const baseP = paisa(item.base_fare);
  const modes: Record<string, EntryMode> = { ...(item.entry_modes || {}) };

  // Keep each % / amount pair in sync against the Base Fare. Whichever side the user
  // entered stays fixed (remembered in entry_modes), so a Base Fare change re-derives a
  // % entry's amount but leaves a flat amount untouched.
  const amounts: Record<string, number> = {};
  for (const [pctField, amtField] of PAIRS) {
    const pct = toNum(updated[pctField]);
    let amtP = paisa(updated[amtField]);
    if (lastEditedField === amtField) modes[amtField] = "amt";
    else if (lastEditedField === pctField) modes[amtField] = "pct";
    const mode: EntryMode =
      modes[amtField] ??
      (options.preferAmounts ? (amtP !== 0 || pct === 0 ? "amt" : "pct") : pct === 0 && amtP !== 0 ? "amt" : "pct");
    // Remember the mode once the pair holds a value, so later Base Fare changes respect it
    if (pct !== 0 || amtP !== 0) modes[amtField] = mode;
    const fromAmount = mode === "amt";

    if (fromAmount) {
      updated[pctField] = baseP > 0 && amtP !== 0 ? fmtPercent((amtP / baseP) * 100) : "";
    } else {
      amtP = Math.round((baseP * pct) / 100);
      updated[amtField] = amtP !== 0 ? fmtAmount(amtP) : "0";
    }
    amounts[amtField] = amtP;
  }

  const gridKeys = item.trip_type === "Domestic" ? DOMESTIC_GRID_TAXES : INTERNATIONAL_GRID_TAXES;
  const gridTaxesP = gridKeys.reduce((s, k) => s + paisa(updated[k]), 0);
  const airlineTaxP = (item.airline_city_taxes || []).reduce((s, t) => s + paisa(t.amount), 0);
  const cityTaxP = (item.city_taxes || []).reduce((s, t) => s + paisa(t.amount), 0);
  const supplierTaxesP = gridTaxesP + airlineTaxP;

  const com = amounts.commission_amount;
  const dis = amounts.discount_amount;
  const dis2 = amounts.discount2_amount;
  const psfP = amounts.psf_p_amount;
  const psf = amounts.psf_amount;
  const gst = amounts.gst_amount;
  const wht = amounts.wht_amount;
  const whtC = amounts.wht_c_amount;
  const seg = amounts.seg_amount;

  const customerGross = baseP + supplierTaxesP + cityTaxP + psfP + gst + whtC + psf + seg;
  const customerNet = customerGross - dis - dis2;
  const supplierGross = baseP + supplierTaxesP + psfP + wht + seg;
  const supplierPayable = supplierGross - com;
  const fbrPayable = gst;
  const agencyProfit = com + psf + cityTaxP + (whtC - wht) - dis - dis2;

  // Identity check: the buckets must always account for every rupee the customer pays
  if (customerNet - supplierPayable - fbrPayable !== agencyProfit) {
    throw new Error("Ticket totals do not balance");
  }

  return {
    ...(updated as T),
    entry_modes: modes,
    customer_gross: rupees(customerGross),
    customer_net: rupees(customerNet),
    supplier_gross: rupees(supplierGross),
    supplier_net: rupees(supplierPayable),
    supplier_gross_wo_wht: rupees(supplierGross - wht),
    fbr_payable: rupees(fbrPayable),
    agency_margin: rupees(agencyProfit),
    amount: fmtAmount(customerNet),
  };
}

/**
 * Server-side: recompute a ticket line before it is saved so stored totals always follow the
 * rules above, whatever the client sent. Entered amounts win over percentages here. Non-ticket
 * lines are returned unchanged.
 */
export function recomputeTicketLine<T extends TicketCalcInput & { service_type?: string }>(item: T): T {
  if (item.service_type && item.service_type !== "Ticket") return item;
  return calculateTicketTotals(item, undefined, { preferAmounts: true });
}
