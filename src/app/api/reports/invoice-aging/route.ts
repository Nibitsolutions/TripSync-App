import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Invoice, InvoiceLineItem, Customer, Payment, PaymentAllocation, CreditNote, Voucher } from "@/models";
import { getAirlineByTicketNumber } from "@/lib/iataAirlines";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as { tenant_id?: string }).tenant_id;
    if (!tenantId) {
      return NextResponse.json({ error: "Tenant ID missing" }, { status: 400 });
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    const customerIdFilter = searchParams.get("customer_id");
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");
    const asOfStr = searchParams.get("as_of_date") || new Date().toISOString();

    const asOfDate = new Date(asOfStr);

    // Build invoice query
    const invQuery: Record<string, unknown> = {
      tenant_id: tenantId,
      status: { $ne: "Voided" },
    };

    if (customerIdFilter && customerIdFilter !== "all") {
      invQuery.customer_id = customerIdFilter;
    }

    if (fromStr || toStr) {
      const dateFilter: Record<string, Date> = {};
      if (fromStr) dateFilter.$gte = new Date(fromStr);
      if (toStr) dateFilter.$lte = new Date(toStr + "T23:59:59.999Z");
      invQuery.created_at = dateFilter;
    }

    const invoices = await Invoice.find(invQuery)
      .populate("customer_id", "name phone email address contact_person code")
      .populate("spo_id", "name email")
      .sort({ created_at: 1 })
      .lean();

    const invoiceIds = invoices.map((i) => i._id);

    // Fetch line items for all these invoices
    const allLineItems = await InvoiceLineItem.find({ invoice_id: { $in: invoiceIds } }).lean();

    // Fetch payment allocations for these invoices
    const allAllocations = await PaymentAllocation.find({ invoice_id: { $in: invoiceIds } }).lean();

    // Fetch credit notes for these invoices
    const allCreditNotes = await CreditNote.find({ invoice_id: { $in: invoiceIds }, status: "Posted" }).lean();

    // Group invoices by customer
    const customerMap: Record<string, {
      customer: { _id: string; name: string; phone?: string; address?: string; code?: string };
      invoices: Array<{
        date: string;
        invoice_number: string;
        description: string;
        sale_gross: number;
        sp_discount: number;
        kb_margin: number;
        sale_net: number;
        refund_amt: number;
        receipt_amt: number;
        adjustment_amt: number;
        balance: number;
        days_over: number;
      }>;
    }> = {};

    for (const inv of invoices) {
      const cust = inv.customer_id as unknown as { _id: string; name: string; phone?: string; address?: string; code?: string } | null;
      if (!cust || !cust._id) continue;

      const custKey = cust._id.toString();
      if (!customerMap[custKey]) {
        customerMap[custKey] = {
          customer: {
            _id: custKey,
            name: cust.name || inv.print_name || "Customer",
            phone: cust.phone || "",
            address: cust.address || "",
            code: cust.code || "",
          },
          invoices: [],
        };
      }

      // Filter line items for this invoice
      const invLineItems = allLineItems.filter((li) => li.invoice_id.toString() === inv._id.toString());
      const invAllocations = allAllocations.filter((a) => a.invoice_id.toString() === inv._id.toString());
      const invCreditNotes = allCreditNotes.filter((cn) => cn.invoice_id.toString() === inv._id.toString());

      const receiptAmt = invAllocations.reduce((sum, a) => sum + (a.allocated_amount || 0), 0);
      const adjustmentAmt = invCreditNotes.reduce((sum, cn) => sum + (cn.total_amount || 0), 0);

      // Build description text & totals from line items
      let paxDescription = "";
      let grossSaleSum = 0;
      let spDiscountSum = 0;
      let kbMarginSum = 0;

      if (invLineItems.length > 0) {
        const descriptions: string[] = [];
        for (const li of invLineItems) {
          const pax = li.pax_name || "PASSENGER";
          const count = li.quantity || 1;
          const sector = li.sector || (li.flight_segments?.[0]?.city) || "";
          const airline = li.airline_code || (li.ticket_number ? getAirlineByTicketNumber(li.ticket_number)?.code : "") || "EK";
          const tktNo = li.ticket_number || "";

          descriptions.push(`${pax.toUpperCase()} X ${count} ${sector ? `(${sector})` : ""}${airline ? `-${airline}` : ""}${tktNo ? ` - ${tktNo}` : ""}`);

          grossSaleSum += Number(li.base_fare) || Number(li.amount) || 0;
          spDiscountSum += Number(li.discount_amount) || 0;
          kbMarginSum += Number(li.agency_margin) || 0;
        }
        paxDescription = descriptions.join(" | ");
      } else {
        paxDescription = inv.remarks || `Invoice #${inv.invoice_number}`;
        grossSaleSum = inv.total_amount || 0;
      }

      const saleNet = inv.total_amount || 0;
      if (grossSaleSum < saleNet) grossSaleSum = saleNet; // ensure gross >= net

      const refundAmt = 0; // ticket refunds
      const balance = Math.max(0, saleNet - refundAmt - receiptAmt - adjustmentAmt);

      const invDate = new Date(inv.created_at);
      const daysOver = Math.max(0, Math.floor((asOfDate.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24)));

      customerMap[custKey].invoices.push({
        date: invDate.toISOString().split("T")[0],
        invoice_number: inv.invoice_number,
        description: paxDescription,
        sale_gross: grossSaleSum,
        sp_discount: spDiscountSum,
        kb_margin: kbMarginSum,
        sale_net: saleNet,
        refund_amt: refundAmt,
        receipt_amt: receiptAmt,
        adjustment_amt: adjustmentAmt,
        balance,
        days_over: daysOver,
      });
    }

    // Now query Un-Adjusted Vouchers and Payments for each customer
    const customerReports = [];
    const grandTotals = {
      sale_gross: 0,
      sp_discount: 0,
      kb_margin: 0,
      sale_net: 0,
      refund_amt: 0,
      receipt_amt: 0,
      adjustment_amt: 0,
      balance: 0,
      final_receivable: 0,
    };

    for (const custKey of Object.keys(customerMap)) {
      const data = customerMap[custKey];

      // Calculate totals for customer invoices
      const totals = data.invoices.reduce(
        (acc, inv) => {
          acc.sale_gross += inv.sale_gross;
          acc.sp_discount += inv.sp_discount;
          acc.kb_margin += inv.kb_margin;
          acc.sale_net += inv.sale_net;
          acc.refund_amt += inv.refund_amt;
          acc.receipt_amt += inv.receipt_amt;
          acc.adjustment_amt += inv.adjustment_amt;
          acc.balance += inv.balance;
          return acc;
        },
        { sale_gross: 0, sp_discount: 0, kb_margin: 0, sale_net: 0, refund_amt: 0, receipt_amt: 0, adjustment_amt: 0, balance: 0 }
      );

      // Fetch unadjusted vouchers/payments for this customer
      const unallocatedPayments = await Payment.find({
        tenant_id: tenantId,
        customer_id: custKey,
        status: "Posted",
      }).lean();

      const unadjustedVouchers: Array<{
        date: string;
        adj_date: string;
        voucher_no: string;
        reference: string;
        description: string;
        debit: number;
        credit: number;
      }> = [];

      let unadjustedDebitSum = 0;
      let unadjustedCreditSum = 0;

      for (const p of unallocatedPayments) {
        // Check allocated total
        const allocs = await PaymentAllocation.find({ payment_id: p._id }).lean();
        const allocSum = allocs.reduce((sum, a) => sum + (a.allocated_amount || 0), 0);
        const unallocated = p.amount - allocSum;

        if (unallocated > 0) {
          unadjustedVouchers.push({
            date: p.created_at ? new Date(p.created_at).toISOString().split("T")[0] : "",
            adj_date: "",
            voucher_no: `PAY-${p._id.toString().slice(-6).toUpperCase()}`,
            reference: p.payment_method || "Payment",
            description: `Unallocated Payment Receipt (${p.payment_method})`,
            debit: 0,
            credit: unallocated,
          });
          unadjustedCreditSum += unallocated;
        }
      }

      // Also check Vouchers collection for unadjusted customer vouchers
      const customerVouchers = await Voucher.find({
        tenant_id: tenantId,
        name_on_voucher: data.customer.name,
        status: "Posted",
      }).lean();

      for (const v of customerVouchers) {
        unadjustedVouchers.push({
          date: v.voucher_date ? new Date(v.voucher_date).toISOString().split("T")[0] : "",
          adj_date: "",
          voucher_no: v.voucher_number,
          reference: v.voucher_type,
          description: v.remarks || `Voucher ${v.voucher_number}`,
          debit: v.total_debit || 0,
          credit: v.total_credit || 0,
        });
        unadjustedDebitSum += v.total_debit || 0;
        unadjustedCreditSum += v.total_credit || 0;
      }

      const finalReceivable = Math.max(0, totals.balance - unadjustedCreditSum + unadjustedDebitSum);

      customerReports.push({
        customer: data.customer,
        invoices: data.invoices,
        totals,
        unadjusted_vouchers: unadjustedVouchers,
        unadjusted_totals: { debit: unadjustedDebitSum, credit: unadjustedCreditSum },
        final_receivable: finalReceivable,
      });

      grandTotals.sale_gross += totals.sale_gross;
      grandTotals.sp_discount += totals.sp_discount;
      grandTotals.kb_margin += totals.kb_margin;
      grandTotals.sale_net += totals.sale_net;
      grandTotals.refund_amt += totals.refund_amt;
      grandTotals.receipt_amt += totals.receipt_amt;
      grandTotals.adjustment_amt += totals.adjustment_amt;
      grandTotals.balance += totals.balance;
      grandTotals.final_receivable += finalReceivable;
    }

    return NextResponse.json({
      as_of_date: asOfStr,
      from: fromStr || "",
      to: toStr || "",
      customer_reports: customerReports,
      grand_totals: grandTotals,
    });
  } catch (error) {
    console.error("Invoice aging error:", error);
    return NextResponse.json({ error: "Failed to fetch invoice aging report" }, { status: 500 });
  }
}
