// Ticket fare / tax / commission arithmetic (dual-sided: customer vs supplier). Shared by the
// ticket invoice screen and spreadsheet bulk upload so both produce identical totals.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TicketCalcInput {
  base_fare?: string;
  trip_type?: string;
  airline_city_taxes?: { code?: string; amount?: string }[];
  city_taxes?: { code?: string; amount?: string }[];
  [key: string]: any;
}

export interface TicketTotals {
  customer_gross: number;
  customer_net: number;
  supplier_gross: number;
  supplier_net: number;
  supplier_gross_wo_wht: number;
  agency_margin: number;
  amount: string;
}

export function calculateTicketTotals<T extends TicketCalcInput>(item: T, lastEditedField?: string): T & TicketTotals {
  const baseFare = parseFloat(item.base_fare || "0") || 0;
  
  // Dynamic Airline City Tax Sum (Liability)
  const airlineCityTaxSum = (item.airline_city_taxes || []).reduce(
    (sum, t) => sum + (parseFloat(t.amount || "0") || 0), 0
  );

  // Dynamic City Tax Sum (Income/Service)
  const cityTaxSum = (item.city_taxes || []).reduce(
    (sum, t) => sum + (parseFloat(t.amount || "0") || 0), 0
  );

  let taxes = 0;
  if (item.trip_type === "Domestic") {
    // Domestic Fixed Taxes (SP, CED, PK, YR, PB, YQ, DOF, XZ, YD, YI, RN, etc.)
    taxes = (parseFloat(item.tax_sp || "0") || 0) +
      (parseFloat(item.tax_ced || "0") || 0) +
      (parseFloat(item.tax_pk || "0") || 0) +
      (parseFloat(item.tax_yr || "0") || 0) +
      (parseFloat(item.tax_pb || "0") || 0) +
      (parseFloat(item.tax_yq || "0") || 0) +
      (parseFloat(item.tax_dof || "0") || 0) +
      (parseFloat(item.tax_xz || "0") || 0) +
      (parseFloat(item.tax_yd || "0") || 0) +
      (parseFloat(item.tax_yi || "0") || 0) +
      (parseFloat(item.tax_rn || "0") || 0) +
      (parseFloat(item.tax_gst_dom || "0") || 0) +
      (parseFloat(item.tax_ast || "0") || 0) +
      (parseFloat(item.tax_apt || "0") || 0) +
      (parseFloat(item.other_taxes || "0") || 0) +
      airlineCityTaxSum +
      cityTaxSum;
  } else {
    // Fixed International Taxes (SP, RG, PK, YR, YQ, DOF, XZ, YD, YI, RN)
    taxes = (parseFloat(item.tax_sp || "0") || 0) +
      (parseFloat(item.tax_rg || "0") || 0) +
      (parseFloat(item.tax_pk || "0") || 0) +
      (parseFloat(item.tax_yr || "0") || 0) +
      (parseFloat(item.tax_yq || "0") || 0) +
      (parseFloat(item.tax_dof || "0") || 0) +
      (parseFloat(item.tax_xz || "0") || 0) +
      (parseFloat(item.tax_yd || "0") || 0) +
      (parseFloat(item.tax_yi || "0") || 0) +
      (parseFloat(item.tax_rn || "0") || 0) +
      (parseFloat(item.tax_apt || "0") || 0) +
      (parseFloat(item.tax_kbr || "0") || 0) +
      (parseFloat(item.tax_kbp || "0") || 0) +
      (parseFloat(item.tax_pb || "0") || 0) +
      (parseFloat(item.other_taxes || "0") || 0) +
      airlineCityTaxSum +
      cityTaxSum;
  }

  const grossFare = baseFare + taxes;
  const fareBase = baseFare > 0 ? baseFare : grossFare;
  
  const updated = { ...item };

  // Helper for bidirectional calculation (% <-> Amount)
  const calcPair = (
    pctField: string,
    amtField: string,
    base: number
  ) => {
    const u = updated as Record<string, any>;
    let pct = parseFloat(String(u[pctField] || "0")) || 0;
    let amt = parseFloat(String(u[amtField] || "0")) || 0;

    if (lastEditedField === amtField) {
      pct = base > 0 ? (amt / base) * 100 : 0;
      u[pctField] = pct > 0 ? (pct % 1 === 0 ? pct.toString() : pct.toFixed(2)) : "";
    } else if (lastEditedField === pctField) {
      amt = (base * pct) / 100;
      u[amtField] = amt > 0 ? (amt % 1 === 0 ? amt.toString() : amt.toFixed(2)) : "0.00";
    } else {
      if (pct === 0 && amt > 0) {
        pct = base > 0 ? (amt / base) * 100 : 0;
        u[pctField] = pct > 0 ? (pct % 1 === 0 ? pct.toString() : pct.toFixed(2)) : "";
      } else if (pct > 0) {
        amt = (base * pct) / 100;
        u[amtField] = amt > 0 ? (amt % 1 === 0 ? amt.toString() : amt.toFixed(2)) : "0.00";
      }
    }
    return { pct, amt };
  };

  // 1. Commission on Base Fare (COM)
  const { amt: commAmt } = calcPair("commission_percent", "commission_amount", fareBase);

  // 2. Withholding Tax on Commission (WHT)
  const { amt: whtAmt } = calcPair("wht_percent", "wht_amount", commAmt);

  // 3. Discount 1 (DIS)
  const { amt: disAmt } = calcPair("discount_percent", "discount_amount", fareBase);

  // 4. Discount 2 (DIS2)
  const { amt: dis2Amt } = calcPair("discount2_percent", "discount2_amount", fareBase);

  // 5. Passenger Service Fee % (PSF/P)
  const { amt: psfPAmt } = calcPair("psf_p_percent", "psf_p_amount", fareBase);

  // 5b. Passenger Service Fee (PSF)
  const { amt: psfAmt } = calcPair("psf_percent", "psf_amount", fareBase);

  const totalPsf = psfPAmt + psfAmt;

  // 6. GST on PSF/service fee (GST)
  const { amt: gstAmt } = calcPair("gst_percent", "gst_amount", totalPsf > 0 ? totalPsf : fareBase);

  // 7. SEG (Segment Fee)
  const { amt: segAmt } = calcPair("seg_percent", "seg_amount", fareBase);

  // 8. WHT_C (Customer Withholding Tax)
  const { amt: whtCAmt } = calcPair("wht_c_percent", "wht_c_amount", fareBase);

  const customerGross = grossFare + totalPsf + segAmt;
  const customerNet = customerGross - disAmt - dis2Amt + gstAmt + whtCAmt;

  const supplierGross = grossFare;
  const supplierNet = supplierGross - commAmt + whtAmt;
  const supplierGrossWoWht = supplierGross - whtAmt;

  const margin = customerNet - supplierNet;

  return {
    ...updated,
    customer_gross: Math.round(customerGross),
    customer_net: Math.round(customerNet),
    supplier_gross: Math.round(supplierGross),
    supplier_net: Math.round(supplierNet),
    supplier_gross_wo_wht: Math.round(supplierGrossWoWht),
    agency_margin: Math.round(margin),
    amount: String(Math.round(customerNet)),
  };
}
