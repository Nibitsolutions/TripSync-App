import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { Invoice, Customer, InvoiceLineItem, Commission } from "@/models";
import { logChanges } from "@/lib/audit";

// POST /api/invoices/[id]/unpost - Unpost a posted invoice back to Draft
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await params;
    const invoice = await Invoice.findOne({ _id: id, tenant_id: user.tenant_id });
    if (!invoice) return errorResponse("Invoice not found", 404);
    if (invoice.status !== "Posted") return errorResponse("Only Posted invoices can be unposted");

    // Deduct invoice amount from customer balance
    const customer = await Customer.findOne({ _id: invoice.customer_id, tenant_id: user.tenant_id });
    if (customer) {
      customer.current_balance = Math.max(0, customer.current_balance - invoice.total_amount);
      await customer.save();
    }

    // Delete commissions linked to this invoice's line items
    const lineItems = await InvoiceLineItem.find({ invoice_id: invoice._id });
    for (const item of lineItems) {
      if (item.commission_id) {
        await Commission.deleteOne({ _id: item.commission_id });
        item.commission_id = undefined;
        await item.save();
      }
    }

    const oldDoc = invoice.toObject();
    invoice.status = "Draft";
    invoice.updated_by = user.user_id;
    await invoice.save();

    await logChanges(
      { tenant_id: user.tenant_id, entity_type: "Invoice", entity_id: invoice._id, changed_by: user.user_id },
      oldDoc,
      invoice.toObject()
    );

    return successResponse({ invoice });
  });
}
