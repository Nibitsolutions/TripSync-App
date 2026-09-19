import { NextRequest } from "next/server";
import { withAuth, successResponse } from "@/lib/api-helpers";
import { Supplier, Booking, InvoiceLineItem } from "@/models";

// GET /api/reports/supplier-ledger - Comprehensive Supplier Ledger Report with Search & Filters
export async function GET(req: NextRequest) {
  return withAuth(async (user) => {
    const { searchParams } = new URL(req.url);
    const supplierId = searchParams.get("supplier_id") || "all";
    const searchQuery = searchParams.get("search") || searchParams.get("query") || "";
    const fromDateStr = searchParams.get("from") || "";
    const toDateStr = searchParams.get("to") || "";

    // 1. Build supplier query
    const supplierFilter: Record<string, any> = { tenant_id: user.tenant_id };
    if (supplierId !== "all" && supplierId.trim() !== "") {
      supplierFilter._id = supplierId;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      // Match supplier by name or code if searching generally
      supplierFilter.$or = [
        { name: { $regex: q, $options: "i" } },
        { code: { $regex: q, $options: "i" } },
      ];
    }

    const suppliers = await Supplier.find(supplierFilter).select("_id name code currency current_balance").lean();
    
    // If search term didn't match supplier name/code directly, fallback to finding suppliers that have matching bookings/tickets
    let matchedSuppliers = [...suppliers];
    if (matchedSuppliers.length === 0 && searchQuery.trim()) {
      const q = searchQuery.trim();
      const allSuppliers = await Supplier.find({ tenant_id: user.tenant_id }).select("_id name code currency current_balance").lean();
      matchedSuppliers = allSuppliers;
    }

    const supplierMap = new Map(matchedSuppliers.map((s) => [s._id.toString(), { name: s.name, code: s.code || "", currency: s.currency || "PKR" }]));
    const supplierIds = matchedSuppliers.map((s) => s._id);

    // 2. Build booking query
    const bookingFilter: Record<string, any> = {
      tenant_id: user.tenant_id,
      supplier_id: { $in: supplierIds },
    };

    if (fromDateStr || toDateStr) {
      bookingFilter.created_at = {};
      if (fromDateStr) bookingFilter.created_at.$gte = new Date(fromDateStr);
      if (toDateStr) {
        const toD = new Date(toDateStr);
        toD.setHours(23, 59, 59, 999);
        bookingFilter.created_at.$lte = toD;
      }
    }

    // 3. Build line items query
    const lineItemFilter: Record<string, any> = {
      tenant_id: user.tenant_id,
      supplier_id: { $in: supplierIds },
    };

    if (fromDateStr || toDateStr) {
      lineItemFilter.created_at = {};
      if (fromDateStr) lineItemFilter.created_at.$gte = new Date(fromDateStr);
      if (toDateStr) {
        const toD = new Date(toDateStr);
        toD.setHours(23, 59, 59, 999);
        lineItemFilter.created_at.$lte = toD;
      }
    }

    const [bookings, lineItems] = await Promise.all([
      Booking.find(bookingFilter).sort({ created_at: 1 }).lean(),
      InvoiceLineItem.find(lineItemFilter).sort({ created_at: 1 }).lean(),
    ]);

    // Build raw supplier entries
    const rawEntries: Array<{
      id: string;
      type: string;
      date: Date;
      supplier_id: string;
      supplier_name: string;
      supplier_code: string;
      reference: string;
      pnr: string;
      debit: number; // Cost / Owed
      credit: number; // Settlement / Paid
      status: string;
    }> = [];

    bookings.forEach((b) => {
      const sup = supplierMap.get(b.supplier_id.toString());
      if (!sup) return;

      const ref = b.booking_reference || `BKG-${b._id.toString().slice(-6).toUpperCase()}`;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const supName = sup.name.toLowerCase();
        const supCode = sup.code.toLowerCase();
        const refLower = ref.toLowerCase();
        const pnrLower = (b.gds_pnr || "").toLowerCase();
        if (!supName.includes(q) && !supCode.includes(q) && !refLower.includes(q) && !pnrLower.includes(q)) {
          return;
        }
      }

      rawEntries.push({
        id: b._id.toString(),
        type: b.service_type || "Booking",
        date: new Date(b.created_at),
        supplier_id: b.supplier_id.toString(),
        supplier_name: sup.name,
        supplier_code: sup.code,
        reference: ref,
        pnr: b.gds_pnr || "—",
        debit: b.total_cost || 0,
        credit: 0,
        status: b.status || "Confirmed",
      });
    });

    lineItems.forEach((li) => {
      if (!li.supplier_id) return;
      const sup = supplierMap.get(li.supplier_id.toString());
      if (!sup) return;

      const ref = li.ticket_number || li.description || `TKT-${li._id.toString().slice(-6).toUpperCase()}`;
      const pnr = (Array.isArray(li.flight_segments) && li.flight_segments[0]?.pnr) || li.gds_pnr || "—";

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const supName = sup.name.toLowerCase();
        const supCode = sup.code.toLowerCase();
        const refLower = ref.toLowerCase();
        const pnrLower = pnr.toLowerCase();
        if (!supName.includes(q) && !supCode.includes(q) && !refLower.includes(q) && !pnrLower.includes(q)) {
          return;
        }
      }

      rawEntries.push({
        id: li._id.toString(),
        type: li.service_type || "Ticket",
        date: new Date(li.created_at),
        supplier_id: li.supplier_id.toString(),
        supplier_name: sup.name,
        supplier_code: sup.code,
        reference: ref,
        pnr,
        debit: Number(li.supplier_net || li.supplier_gross || li.amount) || 0,
        credit: 0,
        status: "Confirmed",
      });
    });

    // Sort entries chronologically to calculate running balance
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

    // Reverse for display (latest first)
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
