import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { Customer, Invoice, Payment, CreditNote, PaymentAllocation } from "@/models";

// GET /api/customers/[id]/ledger - Get customer ledger with optional invoice_number, from, to filters
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const invoiceNumberQuery = searchParams.get("invoice_number") || searchParams.get("search") || "";
    const fromDateStr = searchParams.get("from") || "";
    const toDateStr = searchParams.get("to") || "";

    const customer = await Customer.findOne({ _id: id, tenant_id: user.tenant_id });
    if (!customer) return errorResponse("Customer not found", 404);

    const invFilter: Record<string, any> = {
      customer_id: id,
      tenant_id: user.tenant_id,
      status: { $ne: "Draft" },
    };

    if (invoiceNumberQuery.trim()) {
      invFilter.invoice_number = { $regex: invoiceNumberQuery.trim(), $options: "i" };
    }

    if (fromDateStr || toDateStr) {
      invFilter.created_at = {};
      if (fromDateStr) invFilter.created_at.$gte = new Date(fromDateStr);
      if (toDateStr) {
        const toD = new Date(toDateStr);
        toD.setHours(23, 59, 59, 999);
        invFilter.created_at.$lte = toD;
      }
    }

    const payFilter: Record<string, any> = {
      customer_id: id,
      tenant_id: user.tenant_id,
      status: "Posted",
    };

    if (fromDateStr || toDateStr) {
      payFilter.created_at = {};
      if (fromDateStr) payFilter.created_at.$gte = new Date(fromDateStr);
      if (toDateStr) {
        const toD = new Date(toDateStr);
        toD.setHours(23, 59, 59, 999);
        payFilter.created_at.$lte = toD;
      }
    }

    const cnFilter: Record<string, any> = {
      tenant_id: user.tenant_id,
      status: "Posted",
    };

    if (fromDateStr || toDateStr) {
      cnFilter.created_at = {};
      if (fromDateStr) cnFilter.created_at.$gte = new Date(fromDateStr);
      if (toDateStr) {
        const toD = new Date(toDateStr);
        toD.setHours(23, 59, 59, 999);
        cnFilter.created_at.$lte = toD;
      }
    }

    const [invoices, payments, creditNotes] = await Promise.all([
      Invoice.find(invFilter).sort({ created_at: -1 }).lean(),
      Payment.find(payFilter).sort({ created_at: -1 }).lean(),
      CreditNote.find(cnFilter)
        .populate({ path: "invoice_id", match: { customer_id: id }, select: "customer_id invoice_number" })
        .sort({ created_at: -1 })
        .lean(),
    ]);

    // Get allocations for payments
    const paymentIds = payments.map((p) => p._id);
    const allocations = await PaymentAllocation.find({ payment_id: { $in: paymentIds } }).lean();

    // Calculate dynamic self-healing balance
    const totalInvoiced = invoices
      .filter((inv) => inv.status === "Posted" || inv.status === "Confirmed")
      .reduce((sum, inv) => sum + inv.total_amount, 0);
    const totalAllocated = allocations.reduce((sum, a) => sum + a.allocated_amount, 0);
    const totalCredits = creditNotes
      .filter((cn) => cn.invoice_id)
      .reduce((sum, cn) => sum + cn.amount, 0);
    const calculatedBalance = totalInvoiced - totalAllocated - totalCredits;

    if (!invoiceNumberQuery && !fromDateStr && !toDateStr && customer.current_balance !== calculatedBalance) {
      customer.current_balance = calculatedBalance;
      await customer.save();
    }

    // Build ledger entries
    const entries = [
      ...invoices.map((inv) => ({
        id: inv._id.toString(),
        type: "invoice" as const,
        date: inv.created_at,
        reference: inv.invoice_number,
        debit: (inv.status === "Posted" || inv.status === "Confirmed") ? inv.total_amount : 0,
        credit: 0,
        status: inv.status,
      })),
      ...payments
        .filter((pay) => {
          if (!invoiceNumberQuery.trim()) return true;
          const ref = `PAY-${pay._id.toString().slice(-6).toUpperCase()}`;
          return ref.toLowerCase().includes(invoiceNumberQuery.trim().toLowerCase());
        })
        .map((pay) => ({
          id: pay._id.toString(),
          type: "payment" as const,
          date: pay.created_at,
          reference: `PAY-${pay._id.toString().slice(-6).toUpperCase()}`,
          debit: 0,
          credit: pay.amount,
          status: pay.status,
        })),
      ...creditNotes
        .filter((cn) => cn.invoice_id)
        .filter((cn) => {
          if (!invoiceNumberQuery.trim()) return true;
          const ref = cn.credit_note_number || `CN-${cn._id.toString().slice(-6).toUpperCase()}`;
          const invObj = cn.invoice_id as unknown as { invoice_number?: string } | null;
          return ref.toLowerCase().includes(invoiceNumberQuery.trim().toLowerCase()) || Boolean(invObj?.invoice_number?.toLowerCase().includes(invoiceNumberQuery.trim().toLowerCase()));
        })
        .map((cn) => ({
          id: cn._id.toString(),
          type: "credit_note" as const,
          date: cn.created_at,
          reference: cn.credit_note_number || `CN-${cn._id.toString().slice(-6).toUpperCase()}`,
          debit: 0,
          credit: cn.amount,
          status: cn.status,
        })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return successResponse({
      customer: { id: customer._id, name: customer.name, credit_limit: customer.credit_limit },
      current_balance: calculatedBalance,
      entries,
      allocations,
    });
  });
}
