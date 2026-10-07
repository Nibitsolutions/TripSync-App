import mongoose from "mongoose";
import { Invoice, InvoiceLineItem, Tenant, Customer } from "@/models";
import { logChanges } from "@/lib/audit";
import { resolveOrCreateCustomer } from "@/lib/customer-utils";
import { validateInvoiceForPosting, validateInvoiceForDraft } from "@/lib/invoiceValidation";
import { nextInvoiceNumber } from "@/lib/numbering";
import { invoiceTypeOf } from "@/lib/taxCodes";
import type { SessionUser } from "@/lib/api-helpers";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function toValidObjectId(id: unknown): mongoose.Types.ObjectId | null {
  if (!id) return null;
  const str = String(id).trim();
  if (str === "none" || str === "null" || str === "undefined") return null;
  if (mongoose.Types.ObjectId.isValid(str)) {
    return new mongoose.Types.ObjectId(str);
  }
  return null;
}

export type CreateInvoiceResult =
  | { ok: true; invoice: any; line_items: any[] }
  | { ok: false; status: number; error: string };

/**
 * Create an invoice with its line items from an invoice-form payload: validation, duplicate
 * ticket protection, numbering, customer balance (when created as Posted) and audit log.
 * Used by the invoice screen (POST /api/invoices) and spreadsheet bulk upload.
 */
export async function createInvoice(
  user: SessionUser,
  body: Record<string, any>,
  options: { allowRapidRepeat?: boolean } = {}
): Promise<CreateInvoiceResult> {
  const {
    customer_id, currency, line_items, status, bsp_flag, bsp_billing_period,
    payment_mode, remarks, internal_remarks, customer_remarks, visit_type, spo_id, supplier_id,
    print_name, cost_center, adj_date, our_xo, client_xo, custom_invoice_number,
  } = body;

  if (!customer_id || !line_items?.length) {
    return { ok: false, status: 400, error: "customer_id and line_items are required" };
  }

  if (status === "Posted") {
    const validationErrors = validateInvoiceForPosting({
      inv_date: "valid",
      customer_id,
      print_name,
      visit_type,
      payment_mode,
      line_items,
    });

    if (validationErrors.length > 0) {
      return { ok: false, status: 400, error: `Cannot post invoice: ${validationErrors.join(", ")}` };
    }
  } else {
    const draftErrors = validateInvoiceForDraft({
      customer_id,
      line_items,
    });
    if (draftErrors.length > 0) {
      return { ok: false, status: 400, error: `Cannot save draft invoice: ${draftErrors.join(", ")}` };
    }
  }

  // Resolve or Auto-Create Customer in DB if typed custom customer name
  const resolvedCustomerId = await resolveOrCreateCustomer(user.tenant_id, customer_id, user.user_id);

  // 1. Duplicate Ticket Number Protection across non-voided invoices
  for (const item of line_items) {
    if (item.ticket_number && String(item.ticket_number).trim()) {
      const cleanTicket = String(item.ticket_number).trim();
      const existingLines = await InvoiceLineItem.find({
        tenant_id: user.tenant_id,
        ticket_number: cleanTicket,
      }).select("invoice_id").lean();

      if (existingLines.length > 0) {
        const invIds = existingLines.map((l) => l.invoice_id);
        const existingInv = await Invoice.findOne({
          _id: { $in: invIds },
          tenant_id: user.tenant_id,
          status: { $ne: "Voided" },
        }).lean();

        if (existingInv) {
          return { ok: false, status: 400, error: "This ticket number has already been used and cannot be used again. To find the existing ticket, please search for it in the search box." };
        }
      }
    }
  }

  // Calculate total amount from line items
  const total_amount = line_items.reduce((sum: number, item: { amount?: number; customer_net?: number }) => {
    const amt = item.customer_net !== undefined && item.customer_net > 0 ? item.customer_net : (parseFloat(String(item.amount)) || 0);
    return sum + amt;
  }, 0);

  // 2. Anti-Rapid Duplicate / Double-Click Protection (within 3 seconds)
  const recentDuplicate = await Invoice.findOne({
    tenant_id: user.tenant_id,
    customer_id: resolvedCustomerId,
    total_amount,
    created_by: user.user_id,
    created_at: { $gte: new Date(Date.now() - 3000) },
  }).lean();

  if (recentDuplicate && !options.allowRapidRepeat) {
    return { ok: false, status: 400, error: "Duplicate invoice submission detected. Please do not double-click Save." };
  }

  const tenant = await Tenant.findById(user.tenant_id);
  if (!tenant) return { ok: false, status: 404, error: "Tenant not found" };

  // Sequential number per invoice type (TCK-1, HTL-1, …); all line items share one type
  const firstItem = line_items[0] as { service_type?: string; service_details?: { template?: string } };
  const invoice_number = await nextInvoiceNumber(
    user.tenant_id,
    invoiceTypeOf(firstItem.service_type || "Ticket", firstItem.service_details?.template)
  );
  const finalStatus = status === "Confirmed" ? "Posted" : status || "Draft";

  const resolvedSpoId = toValidObjectId(spo_id);
  const resolvedSupplierId = toValidObjectId(supplier_id);

  const invoice = await Invoice.create({
    tenant_id: user.tenant_id,
    customer_id: resolvedCustomerId,
    invoice_number,
    status: finalStatus,
    currency: currency || tenant.base_currency,
    total_amount,
    bsp_flag: bsp_flag || false,
    bsp_billing_period: bsp_billing_period || null,
    payment_mode: payment_mode || "CR",
    remarks: remarks || "",
    internal_remarks: internal_remarks || remarks || "",
    customer_remarks: customer_remarks || "",
    visit_type: visit_type || "Visitor",
    spo_id: resolvedSpoId,
    supplier_id: resolvedSupplierId,
    print_name: print_name || "",
    cost_center: cost_center || "",
    adj_date: adj_date ? new Date(adj_date) : null,
    our_xo: our_xo || "",
    client_xo: client_xo || "",
    custom_invoice_number: String(custom_invoice_number || "").trim(),
    created_by: user.user_id,
    updated_by: user.user_id,
  });

  if (finalStatus === "Posted" || finalStatus === "Confirmed") {
    try {
      await Customer.updateOne(
        { _id: resolvedCustomerId, tenant_id: user.tenant_id },
        { $inc: { current_balance: total_amount } }
      );
    } catch (custErr) {
      console.error("Failed to update customer balance:", custErr);
    }
  }

  // Create line items
  const lineItemDocs = await InvoiceLineItem.insertMany(
    line_items.map((item: Record<string, unknown>) => ({
      invoice_id: invoice._id,
      tenant_id: user.tenant_id,
      service_type: item.service_type || "Other",
      description: item.description || (item.pax_name ? `Ticket: ${item.ticket_number || ''} ${item.pax_name}` : "Service"),
      amount: typeof item.customer_net === "number" && item.customer_net > 0 ? item.customer_net : (parseFloat(String(item.amount || 0)) || 0),
      tax_code_id: toValidObjectId(item.tax_code_id),
      booking_reference: item.booking_reference || null,
      commission_override_rate: item.commission_override_rate !== undefined && item.commission_override_rate !== "" && item.commission_override_rate !== null ? parseFloat(String(item.commission_override_rate)) : null,
      
      // Passenger & Airline Details
      pax_name: item.pax_name || "",
      pax_type: item.pax_type || "A",
      passport_no: item.passport_no || "",
      passport_issue_date: item.passport_issue_date || "",
      ticket_number: item.ticket_number || "",
      conjunction_ticket_no: item.conjunction_ticket_no || "",
      conjunction_route: item.conjunction_route || "",
      conjunction_city: item.conjunction_city || "",
      conjunction_flight_no: item.conjunction_flight_no || "",
      conjunction_booking_class: item.conjunction_booking_class || "",
      conjunction_dep_date: item.conjunction_dep_date || "",
      conjunction_arr_date: item.conjunction_arr_date || "",
      conjunction_dep_time: item.conjunction_dep_time || "",
      conjunction_arr_time: item.conjunction_arr_time || "",
      gds_pnr: item.gds_pnr || "",
      gds_name: item.gds_name || "",
      airline_name: item.airline_name || "",
      airline_code: item.airline_code || "",
      sector: item.sector || "",
      trip_type: item.trip_type || "International",
      doc_type: item.doc_type || "BSPD",
      tour_code: item.tour_code || "",
      issue_date: item.issue_date || "",
      customer_remarks: item.customer_remarks || "",
      our_xo: item.our_xo || "",

      // Flight Segments
      flight_segments: Array.isArray(item.flight_segments) ? item.flight_segments : [],

      // Airfare & IATA Taxes
      base_fare: parseFloat(String(item.base_fare || 0)) || 0,
      tax_sp: parseFloat(String(item.tax_sp || 0)) || 0,
      tax_dof: parseFloat(String(item.tax_dof || 0)) || 0,
      tax_yq: parseFloat(String(item.tax_yq || 0)) || 0,
      tax_yr: parseFloat(String(item.tax_yr || 0)) || 0,
      tax_rg: parseFloat(String(item.tax_rg || 0)) || 0,
      tax_pk: parseFloat(String(item.tax_pk || 0)) || 0,
      tax_apt: parseFloat(String(item.tax_apt || 0)) || 0,
      tax_kbr: parseFloat(String(item.tax_kbr || 0)) || 0,
      tax_kbp: parseFloat(String(item.tax_kbp || 0)) || 0,
      tax_pb: parseFloat(String(item.tax_pb || 0)) || 0,
      tax_xz: parseFloat(String(item.tax_xz || 0)) || 0,
      tax_yd: parseFloat(String(item.tax_yd || 0)) || 0,
      tax_yi: parseFloat(String(item.tax_yi || 0)) || 0,
      tax_rn: parseFloat(String(item.tax_rn || 0)) || 0,
      tax_city: parseFloat(String(item.tax_city || 0)) || 0,
      tax_airline_city: parseFloat(String(item.tax_airline_city || 0)) || 0,
      other_taxes: parseFloat(String(item.other_taxes || 0)) || 0,
      tax_ced: parseFloat(String(item.tax_ced || 0)) || 0,
      tax_gst_dom: parseFloat(String(item.tax_gst_dom || 0)) || 0,
      tax_ast: parseFloat(String(item.tax_ast || 0)) || 0,
      airline_city_taxes: Array.isArray(item.airline_city_taxes) ? item.airline_city_taxes : [],
      city_taxes: Array.isArray(item.city_taxes) ? item.city_taxes : [],

      // Commercials & Deductions
      wht_percent: parseFloat(String(item.wht_percent || 0)) || 0,
      wht_amount: parseFloat(String(item.wht_amount || 0)) || 0,
      commission_percent: parseFloat(String(item.commission_percent || 0)) || 0,
      commission_amount: parseFloat(String(item.commission_amount || 0)) || 0,
      discount_percent: parseFloat(String(item.discount_percent || 0)) || 0,
      discount_amount: parseFloat(String(item.discount_amount || 0)) || 0,
      discount2_percent: parseFloat(String(item.discount2_percent || 0)) || 0,
      discount2_amount: parseFloat(String(item.discount2_amount || 0)) || 0,
      psf_p_percent: parseFloat(String(item.psf_p_percent || 0)) || 0,
      psf_p_amount: parseFloat(String(item.psf_p_amount || 0)) || 0,
      psf_percent: parseFloat(String(item.psf_percent || 0)) || 0,
      psf_amount: parseFloat(String(item.psf_amount || 0)) || 0,
      gst_percent: parseFloat(String(item.gst_percent || 0)) || 0,
      gst_amount: parseFloat(String(item.gst_amount || 0)) || 0,
      seg_percent: parseFloat(String(item.seg_percent || 0)) || 0,
      seg_amount: parseFloat(String(item.seg_amount || 0)) || 0,
      wht_c_percent: parseFloat(String(item.wht_c_percent || 0)) || 0,
      wht_c_amount: parseFloat(String(item.wht_c_amount || 0)) || 0,
      auto_update: item.auto_update !== undefined ? Boolean(item.auto_update) : true,
      cancellation_charges_self: parseFloat(String(item.cancellation_charges_self || 0)) || 0,
      cancellation_charges_supplier: parseFloat(String(item.cancellation_charges_supplier || 0)) || 0,

      // Accounting Summary
      supplier_id: toValidObjectId(item.supplier_id) || resolvedSupplierId,
      customer_gross: parseFloat(String(item.customer_gross || 0)) || 0,
      customer_net: parseFloat(String(item.customer_net || item.amount || 0)) || 0,
      supplier_gross: parseFloat(String(item.supplier_gross || 0)) || 0,
      supplier_net: parseFloat(String(item.supplier_net || 0)) || 0,
      supplier_gross_wo_wht: parseFloat(String(item.supplier_gross_wo_wht || 0)) || 0,
      agency_margin: parseFloat(String(item.agency_margin || 0)) || 0,

      // Non-ticket service details
      service_details: item.service_details && typeof item.service_details === "object" ? item.service_details : {},
      pax_list: Array.isArray(item.pax_list) ? item.pax_list : [],
    }))
  );

  try {
    await logChanges(
      { tenant_id: user.tenant_id, entity_type: "Invoice", entity_id: invoice._id, changed_by: user.user_id },
      null,
      invoice.toObject()
    );
  } catch (auditErr) {
    console.error("Audit log failed:", auditErr);
  }

  return { ok: true, invoice, line_items: lineItemDocs };
}
