import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { Invoice, InvoiceLineItem, Tenant, Customer, PaymentAllocation, CreditNote } from "@/models";
import { logChanges } from "@/lib/audit";
import { resolveOrCreateCustomer } from "@/lib/customer-utils";
import mongoose from "mongoose";

function toValidObjectId(id: unknown): mongoose.Types.ObjectId | null {
  if (!id) return null;
  const str = String(id).trim();
  if (str === "none" || str === "null" || str === "undefined") return null;
  if (mongoose.Types.ObjectId.isValid(str)) {
    return new mongoose.Types.ObjectId(str);
  }
  return null;
}

// GET /api/invoices - List invoices with search & filters
export async function GET(req: NextRequest) {
  return withAuth(async (user) => {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const customer_id = searchParams.get("customer_id");
    const service_type = searchParams.get("type");
    const search = searchParams.get("search")?.trim();
    const date_range = searchParams.get("date_range");
    const start_date = searchParams.get("start_date");
    const end_date = searchParams.get("end_date");
    const payment_status = searchParams.get("payment_status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    const filter: Record<string, unknown> = { tenant_id: user.tenant_id };
    if (status && status !== "all") filter.status = status;
    if (customer_id && customer_id !== "all") filter.customer_id = customer_id;

    // Date Range filtering
    const now = new Date();
    if (date_range === "today") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      filter.created_at = { $gte: start, $lte: end };
    } else if (date_range === "this_week") {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const start = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0);
      filter.created_at = { $gte: start };
    } else if (date_range === "last_week") {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1) - 7;
      const start = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), diff + 6, 23, 59, 59, 999);
      filter.created_at = { $gte: start, $lte: end };
    } else if (date_range === "this_month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      filter.created_at = { $gte: start };
    } else if (date_range === "last_month") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      filter.created_at = { $gte: start, $lte: end };
    } else if (start_date || end_date) {
      const dateFilter: Record<string, Date> = {};
      if (start_date) dateFilter.$gte = new Date(start_date);
      if (end_date) {
        const e = new Date(end_date);
        e.setHours(23, 59, 59, 999);
        dateFilter.$lte = e;
      }
      filter.created_at = dateFilter;
    }

    // Service type filter
    if (service_type) {
      const matchingLineItems = await InvoiceLineItem.find({ tenant_id: user.tenant_id, service_type })
        .select("invoice_id")
        .lean();
      const invoiceIds = matchingLineItems.map((li) => li.invoice_id);
      filter._id = { $in: invoiceIds };
    }

    // Search query filter (Customer name, invoice number, print name, passenger name, ticket no, PNR)
    if (search) {
      const matchingCustomers = await Customer.find({
        tenant_id: user.tenant_id,
        $or: [
          { name: { $regex: search, $options: "i" } },
          { code: { $regex: search, $options: "i" } },
        ],
      }).select("_id").lean();
      const custIds = matchingCustomers.map((c) => c._id);

      const matchingLines = await InvoiceLineItem.find({
        tenant_id: user.tenant_id,
        $or: [
          { pax_name: { $regex: search, $options: "i" } },
          { ticket_number: { $regex: search, $options: "i" } },
          { gds_pnr: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ],
      }).select("invoice_id").lean();
      const lineInvoiceIds = matchingLines.map((l) => l.invoice_id);

      filter.$or = [
        { invoice_number: { $regex: search, $options: "i" } },
        { print_name: { $regex: search, $options: "i" } },
        { customer_id: { $in: custIds } },
        { _id: { $in: lineInvoiceIds } },
      ];
    }

    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .populate("customer_id", "name code")
        .sort({ created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Invoice.countDocuments(filter),
    ]);

    // Attach payment allocations & credit notes to calculate Paid / Due / Status
    const invoiceIds = invoices.map((i) => i._id);

    const [allocations, credits] = await Promise.all([
      PaymentAllocation.aggregate([
        { $match: { invoice_id: { $in: invoiceIds } } },
        { $group: { _id: "$invoice_id", total_allocated: { $sum: "$allocated_amount" } } },
      ]),
      CreditNote.aggregate([
        { $match: { invoice_id: { $in: invoiceIds }, status: "Posted" } },
        { $group: { _id: "$invoice_id", total_credit: { $sum: "$amount" } } },
      ]),
    ]);

    const allocMap = new Map(allocations.map((a) => [String(a._id), a.total_allocated]));
    const creditMap = new Map(credits.map((c) => [String(c._id), c.total_credit]));

    let enhancedInvoices = invoices.map((inv) => {
      const invId = String(inv._id);
      const paid = allocMap.get(invId) || 0;
      const credit = creditMap.get(invId) || 0;
      const due = Math.max(0, (inv.total_amount || 0) - paid - credit);
      let payStatus: "Paid" | "Partial" | "Unpaid" = "Unpaid";
      if (inv.status === "Draft" || inv.status === "Voided") {
        payStatus = "Unpaid";
      } else if (due <= 0 && inv.total_amount > 0) {
        payStatus = "Paid";
      } else if (paid > 0) {
        payStatus = "Partial";
      }
      return {
        ...inv,
        paid_amount: paid,
        credit_amount: credit,
        due_amount: due,
        payment_status: payStatus,
      };
    });

    if (payment_status && payment_status !== "all") {
      enhancedInvoices = enhancedInvoices.filter((i) => i.payment_status === payment_status);
    }

    return successResponse({ invoices: enhancedInvoices, total, page, pages: Math.ceil(total / limit) });
  });
}

// POST /api/invoices - Create draft invoice
export async function POST(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json();
    const {
      customer_id, currency, line_items, status, bsp_flag, bsp_billing_period,
      payment_mode, remarks, internal_remarks, customer_remarks, visit_type, spo_id, supplier_id,
      print_name, cost_center, adj_date, our_xo, client_xo,
    } = body;

    if (!customer_id || !line_items?.length) {
      return errorResponse("customer_id and line_items are required");
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
            return errorResponse(
              `Duplicate Error: Ticket #${cleanTicket} is already invoiced under Invoice #${existingInv.invoice_number}. Cannot invoice the same ticket twice.`,
              400
            );
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

    if (recentDuplicate) {
      return errorResponse("Duplicate invoice submission detected. Please do not double-click Save.", 400);
    }

    // Generate sequential invoice number
    const tenant = await Tenant.findById(user.tenant_id);
    if (!tenant) return errorResponse("Tenant not found", 404);

    const lastInvoice = await Invoice.findOne({ tenant_id: user.tenant_id })
      .sort({ created_at: -1 })
      .lean();

    let nextNum = 1;
    if (lastInvoice) {
      const match = lastInvoice.invoice_number.match(/(\d+)$/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }

    const invoice_number = `${tenant.invoice_prefix}-${String(nextNum).padStart(6, "0")}`;
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

    return successResponse({ invoice, line_items: lineItemDocs }, 201);
  });
}

