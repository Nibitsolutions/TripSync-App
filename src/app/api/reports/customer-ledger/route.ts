import { NextRequest } from "next/server";
import { withAuth, successResponse } from "@/lib/api-helpers";
import { Customer, Invoice, Payment, CreditNote, PaymentAllocation } from "@/models";

// GET /api/reports/customer-ledger - Comprehensive Customer Ledger Report with Search & Filters
export async function GET(req: NextRequest) {
  return withAuth(async (user) => {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customer_id") || "all";
    const invoiceNumberQuery = searchParams.get("invoice_number") || searchParams.get("search") || "";
    const fromDateStr = searchParams.get("from") || "";
    const toDateStr = searchParams.get("to") || "";

    // Build filter objects
    const customerFilter: Record<string, any> = { tenant_id: user.tenant_id };
    if (customerId !== "all" && customerId.trim() !== "") {
      customerFilter._id = customerId;
    }

    const customers = await Customer.find(customerFilter).select("_id name code credit_limit current_balance").lean();
    const customerMap = new Map(customers.map((c) => [c._id.toString(), c.name]));
    const customerIds = customers.map((c) => c._id);

    const invFilter: Record<string, any> = {
      tenant_id: user.tenant_id,
      customer_id: { $in: customerIds },
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
      tenant_id: user.tenant_id,
      customer_id: { $in: customerIds },
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
      Invoice.find(invFilter).sort({ created_at: 1 }).lean(),
      Payment.find(payFilter).sort({ created_at: 1 }).lean(),
      CreditNote.find(cnFilter)
        .populate({ path: "invoice_id", match: { customer_id: { $in: customerIds } }, select: "customer_id invoice_number" })
        .sort({ created_at: 1 })
        .lean(),
    ]);

    // Build raw ledger entries array
    const rawEntries: Array<{
      id: string;
      type: "invoice" | "payment" | "credit_note";
      date: Date;
      customer_id: string;
      customer_name: string;
      reference: string;
      debit: number;
      credit: number;
      status: string;
    }> = [];

    invoices.forEach((inv) => {
      rawEntries.push({
        id: inv._id.toString(),
        type: "invoice",
        date: new Date(inv.created_at),
        customer_id: inv.customer_id.toString(),
        customer_name: customerMap.get(inv.customer_id.toString()) || "Customer",
        reference: inv.invoice_number,
        debit: inv.status === "Posted" || inv.status === "Confirmed" ? inv.total_amount : 0,
        credit: 0,
        status: inv.status,
      });
    });

    payments.forEach((pay) => {
      const ref = `PAY-${pay._id.toString().slice(-6).toUpperCase()}`;
      if (invoiceNumberQuery.trim() && !ref.toLowerCase().includes(invoiceNumberQuery.trim().toLowerCase())) {
        // Skip payment if filtering strictly by invoice number and reference doesn't match
        return;
      }
      rawEntries.push({
        id: pay._id.toString(),
        type: "payment",
        date: new Date(pay.created_at),
        customer_id: pay.customer_id.toString(),
        customer_name: customerMap.get(pay.customer_id.toString()) || "Customer",
        reference: ref,
        debit: 0,
        credit: pay.amount,
        status: pay.status,
      });
    });

    creditNotes
      .filter((cn) => cn.invoice_id)
      .forEach((cn) => {
        const invObj = cn.invoice_id as unknown as { _id?: string; customer_id?: string; invoice_number?: string } | null;
        if (!invObj || !invObj.customer_id) return;
        const ref = cn.credit_note_number || `CN-${cn._id.toString().slice(-6).toUpperCase()}`;
        if (invoiceNumberQuery.trim() && !ref.toLowerCase().includes(invoiceNumberQuery.trim().toLowerCase()) && !invObj.invoice_number?.toLowerCase().includes(invoiceNumberQuery.trim().toLowerCase())) {
          return;
        }
        rawEntries.push({
          id: cn._id.toString(),
          type: "credit_note",
          date: new Date(cn.created_at),
          customer_id: invObj.customer_id.toString(),
          customer_name: customerMap.get(invObj.customer_id.toString()) || "Customer",
          reference: ref,
          debit: 0,
          credit: cn.amount,
          status: cn.status,
        });
      });

    // Sort entries chronologically to compute running balance correctly
    rawEntries.sort((a, b) => a.date.getTime() - b.date.getTime());

    let totalDebit = 0;
    let totalCredit = 0;
    let runningBalance = 0;

    const entries = rawEntries.map((e) => {
      totalDebit += e.debit;
      totalCredit += e.credit;
      runningBalance += e.debit - e.credit;
      return {
        ...e,
        running_balance: runningBalance,
      };
    });

    // Return reverse-chronological list for UI table while preserving calculated running balance
    entries.reverse();

    return successResponse({
      summary: {
        total_debit: totalDebit,
        total_credit: totalCredit,
        net_balance: totalDebit - totalCredit,
        entry_count: entries.length,
      },
      entries,
    });
  });
}
