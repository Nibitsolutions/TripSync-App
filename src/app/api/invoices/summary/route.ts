import { NextRequest } from "next/server";
import { withAuth, successResponse } from "@/lib/api-helpers";
import { Invoice, InvoiceLineItem, PaymentAllocation, CreditNote } from "@/models";

// GET /api/invoices/summary - One day's totals across all invoice types (All Invoices dashboard).
// Business, dues and P&L count Posted invoices only; drafts aren't final and voided ones are cancelled.
export async function GET(req: NextRequest) {
  return withAuth(async (user) => {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date"); // YYYY-MM-DD, defaults to today

    const day = dateParam ? new Date(`${dateParam}T00:00:00`) : new Date();
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0);
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);

    const dayInvoices = await Invoice.find({ tenant_id: user.tenant_id, created_at: { $gte: start, $lte: end } })
      .select("_id status total_amount")
      .lean();

    const statusCounts = { Posted: 0, Draft: 0, Voided: 0 };
    for (const inv of dayInvoices) {
      if (inv.status in statusCounts) statusCounts[inv.status as keyof typeof statusCounts]++;
    }

    const posted = dayInvoices.filter((i) => i.status === "Posted");
    const postedIds = posted.map((i) => i._id);

    const [allocations, credits, lines] = await Promise.all([
      PaymentAllocation.aggregate([
        { $match: { invoice_id: { $in: postedIds } } },
        { $group: { _id: "$invoice_id", total: { $sum: "$allocated_amount" } } },
      ]),
      CreditNote.aggregate([
        { $match: { invoice_id: { $in: postedIds }, status: "Posted" } },
        { $group: { _id: "$invoice_id", total: { $sum: "$amount" } } },
      ]),
      InvoiceLineItem.find({ invoice_id: { $in: postedIds } })
        .select("invoice_id service_type agency_margin supplier_net created_at")
        .sort({ created_at: 1, _id: 1 })
        .lean(),
    ]);

    const allocMap = new Map(allocations.map((a) => [String(a._id), a.total as number]));
    const creditMap = new Map(credits.map((c) => [String(c._id), c.total as number]));

    // Invoice type = service type of its first line item
    const typeMap = new Map<string, string>();
    let profit = 0;
    let supplierCost = 0;
    for (const li of lines) {
      const id = String(li.invoice_id);
      if (!typeMap.has(id)) typeMap.set(id, li.service_type);
      profit += li.agency_margin || 0;
      supplierCost += li.supplier_net || 0;
    }

    let totalBusiness = 0;
    let paymentsDue = 0;
    let received = 0;
    let unpaid = 0;
    let partial = 0;
    let paid = 0;
    const byType: Record<string, { count: number; amount: number }> = {};

    for (const inv of posted) {
      const id = String(inv._id);
      const total = inv.total_amount || 0;
      const settled = (allocMap.get(id) || 0) + (creditMap.get(id) || 0);
      const due = Math.max(0, total - settled);

      totalBusiness += total;
      paymentsDue += due;
      received += Math.min(total, settled);
      if (due <= 0 && total > 0) paid++;
      else if (settled > 0) partial++;
      else unpaid++;

      const type = typeMap.get(id) || "Ticket";
      byType[type] = byType[type] || { count: 0, amount: 0 };
      byType[type].count++;
      byType[type].amount += total;
    }

    return successResponse({
      date: start.toISOString(),
      invoice_count: posted.length,
      status_counts: statusCounts,
      total_business: Math.round(totalBusiness),
      by_type: Object.entries(byType)
        .map(([type, v]) => ({ type, count: v.count, amount: Math.round(v.amount) }))
        .sort((a, b) => b.amount - a.amount),
      payments_due: Math.round(paymentsDue),
      payments_received: Math.round(received),
      paid_count: paid,
      partial_count: partial,
      unpaid_count: unpaid,
      profit_loss: Math.round(profit),
      supplier_cost: Math.round(supplierCost),
    });
  });
}
