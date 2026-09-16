import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { Invoice, InvoiceLineItem } from "@/models";
import { resolveOrCreateCustomer } from "@/lib/customer-utils";
import mongoose from "mongoose";

// GET /api/invoices/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await params;
    const invoice = await Invoice.findOne({ _id: id, tenant_id: user.tenant_id })
      .populate("customer_id", "name code email phone")
      .populate("supplier_id", "name code")
      .populate("spo_id", "name email")
      .lean();
    if (!invoice) return errorResponse("Invoice not found", 404);
    const lineItems = await InvoiceLineItem.find({ invoice_id: id })
      .populate("tax_code_id", "code rate")
      .populate("supplier_id", "name code")
      .lean();
    return successResponse({ invoice, line_items: lineItems });
  });
}

// PATCH /api/invoices/[id] - update Draft invoices only
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await params;
    const invoice = await Invoice.findOne({ _id: id, tenant_id: user.tenant_id });
    if (!invoice) return errorResponse("Invoice not found", 404);
    if (invoice.status !== "Draft") return errorResponse("Only Draft invoices can be edited", 400);

    const body = await req.json();
    const {
      customer_id, currency, bsp_flag, bsp_billing_period, line_items,
      payment_mode, remarks, internal_remarks, customer_remarks, visit_type, spo_id, supplier_id,
      print_name, cost_center, adj_date, our_xo, client_xo,
    } = body;

    if (customer_id) {
      invoice.customer_id = await resolveOrCreateCustomer(user.tenant_id, customer_id, user.user_id);
    }
    if (currency) invoice.currency = currency;
    if (bsp_flag !== undefined) invoice.bsp_flag = bsp_flag;
    if (bsp_billing_period !== undefined) invoice.bsp_billing_period = bsp_billing_period;
    if (payment_mode !== undefined) invoice.payment_mode = payment_mode;
    if (remarks !== undefined) invoice.remarks = remarks;
    if (internal_remarks !== undefined) invoice.internal_remarks = internal_remarks;
    if (customer_remarks !== undefined) invoice.customer_remarks = customer_remarks;
    if (visit_type !== undefined) invoice.visit_type = visit_type;
    if (spo_id !== undefined) invoice.spo_id = spo_id ? new mongoose.Types.ObjectId(spo_id) : null;
    if (supplier_id !== undefined) invoice.supplier_id = supplier_id ? new mongoose.Types.ObjectId(supplier_id) : null;
    if (print_name !== undefined) invoice.print_name = print_name;
    if (cost_center !== undefined) invoice.cost_center = cost_center;
    if (adj_date !== undefined) invoice.adj_date = adj_date ? new Date(adj_date) : null;
    if (our_xo !== undefined) invoice.our_xo = our_xo;
    if (client_xo !== undefined) invoice.client_xo = client_xo;

    invoice.updated_by = new mongoose.Types.ObjectId(user.user_id);
    await invoice.save();

    if (Array.isArray(line_items)) {
      await InvoiceLineItem.deleteMany({ invoice_id: id });
      let total = 0;
      for (const li of line_items) {
        const amt = li.customer_net !== undefined && li.customer_net > 0 ? li.customer_net : (parseFloat(String(li.amount)) || 0);
        total += amt;
        await InvoiceLineItem.create({
          invoice_id: id,
          tenant_id: user.tenant_id,
          service_type: li.service_type || "Other",
          description: li.description || (li.pax_name ? `Ticket: ${li.ticket_number || ''} ${li.pax_name}` : "Service"),
          amount: amt,
          commission_override_rate: li.commission_override_rate ? parseFloat(String(li.commission_override_rate)) : null,
          tax_code_id: li.tax_code_id && li.tax_code_id !== "none" ? li.tax_code_id : null,
          
          // Passenger & Airline Details
          pax_name: li.pax_name || "",
          pax_type: li.pax_type || "A",
          passport_no: li.passport_no || "",
          passport_issue_date: li.passport_issue_date || "",
          ticket_number: li.ticket_number || "",
          conjunction_ticket_no: li.conjunction_ticket_no || "",
          conjunction_route: li.conjunction_route || "",
          gds_pnr: li.gds_pnr || "",
          gds_name: li.gds_name || "",
          airline_name: li.airline_name || "",
          airline_code: li.airline_code || "",
          sector: li.sector || "",
          trip_type: li.trip_type || "International",
          doc_type: li.doc_type || "BSPD",
          tour_code: li.tour_code || "",
          issue_date: li.issue_date || "",

          // Flight Segments
          flight_segments: Array.isArray(li.flight_segments) ? li.flight_segments : [],

          // Airfare & IATA Taxes
          base_fare: parseFloat(li.base_fare) || 0,
          tax_sp: parseFloat(li.tax_sp) || 0,
          tax_dof: parseFloat(li.tax_dof) || 0,
          tax_yq: parseFloat(li.tax_yq) || 0,
          tax_yr: parseFloat(li.tax_yr) || 0,
          tax_rg: parseFloat(li.tax_rg) || 0,
          tax_pk: parseFloat(li.tax_pk) || 0,
          tax_apt: parseFloat(li.tax_apt) || 0,
          tax_kbr: parseFloat(li.tax_kbr) || 0,
          tax_kbp: parseFloat(li.tax_kbp) || 0,
          tax_pb: parseFloat(li.tax_pb) || 0,
          tax_xz: parseFloat(li.tax_xz) || 0,
          tax_yd: parseFloat(li.tax_yd) || 0,
          tax_yi: parseFloat(li.tax_yi) || 0,
          tax_rn: parseFloat(li.tax_rn) || 0,
          tax_city: parseFloat(li.tax_city) || 0,
          tax_airline_city: parseFloat(li.tax_airline_city) || 0,
          other_taxes: parseFloat(li.other_taxes) || 0,
          airline_city_taxes: Array.isArray(li.airline_city_taxes) ? li.airline_city_taxes : [],
          city_taxes: Array.isArray(li.city_taxes) ? li.city_taxes : [],

          // Commercials & Deductions
          wht_percent: parseFloat(li.wht_percent) || 0,
          wht_amount: parseFloat(li.wht_amount) || 0,
          commission_percent: parseFloat(li.commission_percent) || 0,
          commission_amount: parseFloat(li.commission_amount) || 0,
          discount_percent: parseFloat(li.discount_percent) || 0,
          discount_amount: parseFloat(li.discount_amount) || 0,
          psf_percent: parseFloat(li.psf_percent) || 0,
          psf_amount: parseFloat(li.psf_amount) || 0,
          gst_percent: parseFloat(li.gst_percent) || 0,
          gst_amount: parseFloat(li.gst_amount) || 0,
          auto_update: li.auto_update !== undefined ? Boolean(li.auto_update) : true,
          cancellation_charges_self: parseFloat(li.cancellation_charges_self) || 0,
          cancellation_charges_supplier: parseFloat(li.cancellation_charges_supplier) || 0,

          // Accounting Summary
          supplier_id: li.supplier_id || supplier_id || null,
          customer_gross: parseFloat(li.customer_gross) || 0,
          customer_net: parseFloat(li.customer_net) || (parseFloat(String(li.amount)) || 0),
          supplier_gross: parseFloat(li.supplier_gross) || 0,
          supplier_net: parseFloat(li.supplier_net) || 0,
          agency_margin: parseFloat(li.agency_margin) || 0,
        });
      }
      invoice.total_amount = total;
      await invoice.save();
    }

    return successResponse({ invoice });
  });
}

// DELETE /api/invoices/[id] - delete Draft or Voided invoices
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await params;
    const invoice = await Invoice.findOne({ _id: id, tenant_id: user.tenant_id });
    if (!invoice) return errorResponse("Invoice not found", 404);

    if (invoice.status === "Posted") {
      return errorResponse("Posted invoices cannot be deleted to preserve financial audit trail. Please Void the invoice instead.", 400);
    }

    await InvoiceLineItem.deleteMany({ invoice_id: id });
    await Invoice.deleteOne({ _id: id, tenant_id: user.tenant_id });

    return successResponse({ message: "Invoice deleted successfully" });
  });
}