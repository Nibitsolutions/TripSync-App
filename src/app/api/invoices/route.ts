import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { Invoice, InvoiceLineItem, Customer, PaymentAllocation, CreditNote } from "@/models";
import { createInvoice } from "@/lib/invoiceCreate";

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
          { "pax_list.name": { $regex: search, $options: "i" } },
          { "service_details.reference_no": { $regex: search, $options: "i" } },
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

    const [allocations, credits, lineTypes] = await Promise.all([
      PaymentAllocation.aggregate([
        { $match: { invoice_id: { $in: invoiceIds } } },
        { $group: { _id: "$invoice_id", total_allocated: { $sum: "$allocated_amount" } } },
      ]),
      CreditNote.aggregate([
        { $match: { invoice_id: { $in: invoiceIds }, status: "Posted" } },
        { $group: { _id: "$invoice_id", total_credit: { $sum: "$amount" } } },
      ]),
      // Invoice type = service type of the invoice's first line item
      InvoiceLineItem.aggregate([
        { $match: { invoice_id: { $in: invoiceIds } } },
        { $sort: { created_at: 1, _id: 1 } },
        { $group: { _id: "$invoice_id", service_type: { $first: "$service_type" } } },
      ]),
    ]);

    const allocMap = new Map(allocations.map((a) => [String(a._id), a.total_allocated]));
    const creditMap = new Map(credits.map((c) => [String(c._id), c.total_credit]));
    const typeMap = new Map(lineTypes.map((t) => [String(t._id), t.service_type as string]));

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
        invoice_type: typeMap.get(invId) || "Ticket",
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
    const result = await createInvoice(user, await req.json());
    if (!result.ok) return errorResponse(result.error, result.status);
    return successResponse({ invoice: result.invoice, line_items: result.line_items }, 201);
  });
}

