import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withAuth, successResponse } from "@/lib/api-helpers";
import { Invoice, InvoiceLineItem, Customer } from "@/models";
import { summarizeInvoices, type InvoiceSummaryInput } from "@/lib/invoiceSummary";

const MAX_PAGE_SIZE = 50;

// Sortable grid columns -> field in the aggregated row
const SORT_FIELDS: Record<string, string> = {
  invoice_number: "invoice_number",
  invoice_date: "created_at",
  invoice_type: "invoice_type",
  customer_name: "customer_name",
  amount: "total_amount",
  status: "status",
  internal_remarks: "internal_remarks",
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// GET /api/invoices/grid - All Invoices grid: per-column filters, sorting, 50-per-page
// pagination, plus summary-card totals for every invoice matching the filters.
export async function GET(req: NextRequest) {
  return withAuth(async (user) => {
    const sp = new URL(req.url).searchParams;
    const page = Math.max(1, parseInt(sp.get("page") || "1") || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(sp.get("limit") || String(MAX_PAGE_SIZE)) || MAX_PAGE_SIZE));
    const sortField = SORT_FIELDS[sp.get("sort_by") || ""] || "created_at";
    const sortDir = sp.get("sort_dir") === "asc" ? 1 : -1;

    const invoiceNumber = sp.get("invoice_number")?.trim();
    const type = sp.get("type")?.trim();
    const customer = sp.get("customer")?.trim();
    const status = sp.get("status")?.trim();
    const remarks = sp.get("remarks")?.trim();
    const amountMin = parseFloat(sp.get("amount_min") || "");
    const amountMax = parseFloat(sp.get("amount_max") || "");
    const dateFrom = sp.get("date_from");
    const dateTo = sp.get("date_to");

    // Filters on stored invoice fields run first, before the lookups
    const match: Record<string, unknown> = { tenant_id: new mongoose.Types.ObjectId(user.tenant_id) };
    if (invoiceNumber) match.invoice_number = { $regex: escapeRegex(invoiceNumber), $options: "i" };
    if (status) match.status = status;
    if (!isNaN(amountMin) || !isNaN(amountMax)) {
      const amt: Record<string, number> = {};
      if (!isNaN(amountMin)) amt.$gte = amountMin;
      if (!isNaN(amountMax)) amt.$lte = amountMax;
      match.total_amount = amt;
    }
    if (dateFrom || dateTo) {
      const dt: Record<string, Date> = {};
      if (dateFrom) dt.$gte = new Date(`${dateFrom}T00:00:00`);
      if (dateTo) dt.$lte = new Date(`${dateTo}T23:59:59.999`);
      match.created_at = dt;
    }
    if (remarks) {
      const rx = { $regex: escapeRegex(remarks), $options: "i" };
      match.$or = [{ internal_remarks: rx }, { remarks: rx }];
    }

    // Filters on derived fields (type from first line item, customer name)
    const derivedMatch: Record<string, unknown> = {};
    if (type) derivedMatch.invoice_type = type;
    if (customer) derivedMatch.customer_name = { $regex: escapeRegex(customer), $options: "i" };

    const [result] = await Invoice.aggregate([
      { $match: match },
      {
        // Invoice type = service type of the invoice's first line item
        $lookup: {
          from: InvoiceLineItem.collection.name,
          let: { id: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$invoice_id", "$$id"] } } },
            { $sort: { created_at: 1, _id: 1 } },
            { $limit: 1 },
            { $project: { service_type: 1 } },
          ],
          as: "first_line",
        },
      },
      {
        $lookup: {
          from: Customer.collection.name,
          localField: "customer_id",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $set: { customer: { $map: { input: "$customer", as: "c", in: { _id: "$$c._id", name: "$$c.name", code: "$$c.code" } } } } },
      {
        $addFields: {
          invoice_type: { $ifNull: [{ $arrayElemAt: ["$first_line.service_type", 0] }, "Ticket"] },
          customer_id: { $ifNull: [{ $arrayElemAt: ["$customer", 0] }, "$customer_id"] },
          customer_name: {
            $ifNull: [{ $arrayElemAt: ["$customer.name", 0] }, { $ifNull: ["$print_name", ""] }],
          },
          // Remarks typed on the invoice form; older invoices only have `remarks`
          internal_remarks: {
            $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$internal_remarks", ""] } }, 0] }, "$internal_remarks", { $ifNull: ["$remarks", ""] }],
          },
        },
      },
      ...(Object.keys(derivedMatch).length ? [{ $match: derivedMatch }] : []),
      {
        $facet: {
          rows: [
            { $sort: { [sortField]: sortDir, _id: sortDir } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                invoice_number: 1, invoice_type: 1, customer_id: 1, customer_name: 1, print_name: 1,
                status: 1, total_amount: 1, internal_remarks: 1, currency: 1, bsp_flag: 1, created_at: 1,
              },
            },
          ],
          all: [{ $project: { status: 1, total_amount: 1 } }],
        },
      },
    ]);

    const matching = (result?.all || []) as InvoiceSummaryInput[];
    const total = matching.length;
    const summary = await summarizeInvoices(matching);

    return successResponse({
      invoices: result?.rows || [],
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      summary,
    });
  });
}
