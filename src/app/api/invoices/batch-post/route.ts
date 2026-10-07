import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { Invoice, InvoiceLineItem } from "@/models";
import { postInvoice } from "@/lib/invoicePosting";

const MAX_BATCH = 50;

// POST /api/invoices/batch-post  { type, ids }
// Posts each selected invoice exactly as single posting does. A batch holds one invoice
// type only; invoices that fail (wrong type, missing required fields, not a draft…) are
// reported and skipped while the rest still post.
export async function POST(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json();
    const type = String(body.type || "").trim();
    const ids: string[] = Array.isArray(body.ids) ? [...new Set(body.ids.map(String))] as string[] : [];

    if (!type) return errorResponse("Invoice type is required for batch posting");
    if (ids.length === 0) return errorResponse("Select at least one invoice to post");
    if (ids.length > MAX_BATCH) return errorResponse(`You can post at most ${MAX_BATCH} invoices at a time`);
    if (ids.some((id) => !mongoose.isValidObjectId(id))) return errorResponse("Invalid invoice selection");

    const invoices = await Invoice.find({ _id: { $in: ids }, tenant_id: user.tenant_id }).select("_id invoice_number").lean();
    const numberById = new Map(invoices.map((i) => [String(i._id), i.invoice_number as string]));

    // An invoice's type is the service type of its line items (all items share one type)
    const lineTypes = await InvoiceLineItem.aggregate([
      { $match: { invoice_id: { $in: invoices.map((i) => i._id) } } },
      { $group: { _id: "$invoice_id", service_type: { $first: "$service_type" } } },
    ]);
    const typeById = new Map(lineTypes.map((t) => [String(t._id), String(t.service_type || "")]));

    const posted: Array<{ id: string; invoice_number: string }> = [];
    const failed: Array<{ id: string; invoice_number: string; error: string }> = [];

    for (const id of ids) {
      const invoice_number = numberById.get(id) || id;
      if (!numberById.has(id)) {
        failed.push({ id, invoice_number, error: "Invoice not found" });
        continue;
      }
      const invoiceType = typeById.get(id) || "Ticket";
      if (invoiceType !== type) {
        failed.push({ id, invoice_number, error: `Not a ${type} invoice (it is ${invoiceType})` });
        continue;
      }
      const result = await postInvoice(user, id);
      if (result.ok) posted.push({ id, invoice_number });
      else failed.push({ id, invoice_number, error: result.error.replace(/^Cannot post invoice: /, "") });
    }

    return successResponse({ posted, failed });
  });
}
