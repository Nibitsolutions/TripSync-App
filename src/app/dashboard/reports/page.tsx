"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Clock, TrendingUp, TrendingDown, Loader2, Printer, FileText, UserCheck, FileSpreadsheet } from "lucide-react";

interface Customer { _id: string; name: string; }

interface InvoiceDetail {
  id: string;
  invoice_number: string;
  customer: string;
  date: string;
  currency: string;
  amount: number;
  amount_base: number;
  service_types: string[];
}

interface ExpenseDetail {
  id: string;
  description: string;
  category: string;
  date: string;
  amount: number;
  currency: string;
}

interface AgentPerformanceDetail {
  id: string;
  name: string;
  email: string;
  sales: number;
  commission: number;
  invoice_count: number;
}

interface PnlData {
  period: { from: string; to: string };
  base_currency: string;
  revenue: number;
  expenses: number;
  net_profit: number;
  invoice_count: number;
  expense_count: number;
  invoices: InvoiceDetail[];
  expenses_detail: ExpenseDetail[];
  revenue_by_type: Record<string, number>;
  agent_performance: AgentPerformanceDetail[];
}

interface AgingEntry {
  customer: { id: string; name: string };
  current: number;
  days_30: number;
  days_60: number;
  days_90: number;
  over_90: number;
  total: number;
}

interface InvoiceAgingReport {
  customer: { _id: string; name: string; phone?: string; address?: string };
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
  totals: {
    sale_gross: number;
    sp_discount: number;
    kb_margin: number;
    sale_net: number;
    refund_amt: number;
    receipt_amt: number;
    adjustment_amt: number;
    balance: number;
  };
  unadjusted_vouchers: Array<{
    date: string;
    adj_date: string;
    voucher_no: string;
    reference: string;
    description: string;
    debit: number;
    credit: number;
  }>;
  unadjusted_totals: { debit: number; credit: number };
  final_receivable: number;
}

interface InvoiceAgingData {
  from: string;
  to: string;
  customer_reports: InvoiceAgingReport[];
  grand_totals: {
    sale_gross: number;
    sp_discount: number;
    kb_margin: number;
    sale_net: number;
    refund_amt: number;
    receipt_amt: number;
    adjustment_amt: number;
    balance: number;
    final_receivable: number;
  };
}

const SERVICE_COLORS: Record<string, string> = {
  Ticket: "bg-blue-500",
  Hotel: "bg-emerald-500",
  Package: "bg-purple-500",
  Umrah: "bg-amber-500",
  Visa: "bg-rose-500",
  Other: "bg-gray-400",
};

export default function ReportsPage() {
  const [pnl, setPnl] = useState<PnlData | null>(null);
  const [aging, setAging] = useState<AgingEntry[]>([]);
  const [invoiceAgingData, setInvoiceAgingData] = useState<InvoiceAgingData | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("all");

  const [fromDate, setFromDate] = useState("2024-01-01");
  const [toDate, setToDate] = useState(new Date().toISOString().split("T")[0]);
  const [loadingPnl, setLoadingPnl] = useState(false);
  const [loadingAging, setLoadingAging] = useState(false);
  const [loadingInvoiceAging, setLoadingInvoiceAging] = useState(false);

  useEffect(() => {
    fetch("/api/customers").then((r) => r.json()).then((d) => setCustomers(d.customers || []));
  }, []);

  async function loadPnl() {
    setLoadingPnl(true);
    const res = await fetch(`/api/reports/pnl?from=${fromDate}&to=${toDate}`);
    setPnl(await res.json());
    setLoadingPnl(false);
  }

  async function loadAging() {
    setLoadingAging(true);
    const res = await fetch(`/api/reports/dues-aging?as_of_date=${new Date().toISOString()}`);
    const data = await res.json();
    setAging(data.aging || []);
    setLoadingAging(false);
  }

  async function loadInvoiceAging() {
    setLoadingInvoiceAging(true);
    const params = new URLSearchParams({
      customer_id: selectedCustomerId,
      from: fromDate,
      to: toDate,
    });
    const res = await fetch(`/api/reports/invoice-aging?${params.toString()}`);
    const data = await res.json();
    setInvoiceAgingData(data);
    setLoadingInvoiceAging(false);
  }

  function printReport() {
    window.print();
  }

  function printInvoiceAging() {
    const params = new URLSearchParams({
      customer_id: selectedCustomerId,
      from: fromDate,
      to: toDate,
    });
    window.open(`/dashboard/reports/aging/print?${params.toString()}`, "_blank");
  }

  const maxRevType = pnl ? Math.max(...Object.values(pnl.revenue_by_type), 1) : 1;

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">Reports</h1>
        <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">Financial reports, invoice-wise aging statements, and analytics</p>
      </div>

      <Tabs defaultValue="invoice-aging">
        <TabsList className="mb-6">
          <TabsTrigger value="invoice-aging" className="gap-2"><FileSpreadsheet className="h-3.5 w-3.5" /> Invoice Wise Aging</TabsTrigger>
          <TabsTrigger value="pnl" className="gap-2"><BarChart3 className="h-3.5 w-3.5" /> Profit &amp; Loss</TabsTrigger>
          <TabsTrigger value="aging" className="gap-2"><Clock className="h-3.5 w-3.5" /> Summary Aging</TabsTrigger>
          <TabsTrigger value="agents" className="gap-2"><UserCheck className="h-3.5 w-3.5" /> Agent Performance</TabsTrigger>
        </TabsList>

        {/* Invoice Wise Aging Tab */}
        <TabsContent value="invoice-aging">
          <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
            <CardHeader className="px-6 pt-5 pb-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <CardTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-50 flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-primary" /> Invoice Wise Aging Statement
                </CardTitle>
                {invoiceAgingData && (
                  <Button variant="outline" size="sm" onClick={printInvoiceAging} className="gap-2 text-[12px] bg-white dark:bg-[#161619]">
                    <Printer className="h-3.5 w-3.5 text-purple-600" /> Print Statement
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <div className="flex flex-col sm:flex-row gap-4 sm:items-end mb-6">
                <div className="space-y-1.5 w-full sm:w-60">
                  <Label className="text-[13px] font-semibold">Customer Filter</Label>
                  <Select value={selectedCustomerId} onValueChange={(v) => setSelectedCustomerId(v || "all")}>
                    <SelectTrigger className="h-10 text-[13px]"><SelectValue placeholder="All Customers" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Customers</SelectItem>
                      {customers.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 w-full sm:w-auto"><Label className="text-[13px] font-semibold">From Date</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-10 text-[13px]" /></div>
                <div className="space-y-1.5 w-full sm:w-auto"><Label className="text-[13px] font-semibold">To Date</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-10 text-[13px]" /></div>
                <Button onClick={loadInvoiceAging} disabled={loadingInvoiceAging} className="h-10 gap-2 w-full sm:w-auto">
                  {loadingInvoiceAging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                  Generate Statement
                </Button>
              </div>

              {!invoiceAgingData ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="h-14 w-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                    <FileSpreadsheet className="h-7 w-7 text-gray-400" strokeWidth={1.5} />
                  </div>
                  <p className="text-[13px] text-gray-400">Select filter criteria and click Generate Statement</p>
                </div>
              ) : invoiceAgingData.customer_reports.length === 0 ? (
                <p className="text-center py-12 text-[13px] text-gray-400">No invoice aging records found for this selection.</p>
              ) : (
                <div className="space-y-8">
                  {invoiceAgingData.customer_reports.map((rep) => (
                    <div key={rep.customer._id} className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 space-y-4 bg-gray-50/30 dark:bg-[#0e0e10]/30">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{rep.customer.name}</h3>
                          <p className="text-xs text-gray-500 mt-0.5">{rep.customer.phone ? `Phone: ${rep.customer.phone}` : ""} {rep.customer.address ? `| Address: ${rep.customer.address}` : ""}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-semibold text-gray-400 uppercase">Final Receivable</span>
                          <p className="text-xl font-bold font-mono text-primary mt-0.5">PKR {rep.final_receivable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                      </div>

                      {/* Invoice Wise Aging Table */}
                      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
                        <Table>
                          <TableHeader className="bg-gray-100 dark:bg-[#151518]">
                            <TableRow className="border-gray-200 dark:border-gray-800">
                              <TableHead className="text-[11px] font-bold text-gray-700 dark:text-gray-300">Date</TableHead>
                              <TableHead className="text-[11px] font-bold text-gray-700 dark:text-gray-300">Inv. No</TableHead>
                              <TableHead className="text-[11px] font-bold text-gray-700 dark:text-gray-300">Description</TableHead>
                              <TableHead className="text-[11px] font-bold text-gray-700 dark:text-gray-300 text-right">Sale Amt (GRS)</TableHead>
                              <TableHead className="text-[11px] font-bold text-gray-700 dark:text-gray-300 text-right">SP</TableHead>
                              <TableHead className="text-[11px] font-bold text-gray-700 dark:text-gray-300 text-right">KB</TableHead>
                              <TableHead className="text-[11px] font-bold text-gray-700 dark:text-gray-300 text-right">Sale Amt (Net)</TableHead>
                              <TableHead className="text-[11px] font-bold text-gray-700 dark:text-gray-300 text-right">Refund Amt</TableHead>
                              <TableHead className="text-[11px] font-bold text-gray-700 dark:text-gray-300 text-right">Receipt</TableHead>
                              <TableHead className="text-[11px] font-bold text-gray-700 dark:text-gray-300 text-right">Adjustment</TableHead>
                              <TableHead className="text-[11px] font-bold text-gray-700 dark:text-gray-300 text-right">Balance</TableHead>
                              <TableHead className="text-[11px] font-bold text-gray-700 dark:text-gray-300 text-center">Days Over</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rep.invoices.map((inv, idx) => (
                              <TableRow key={idx} className="border-gray-100 dark:border-gray-800">
                                <TableCell className="text-xs text-gray-600 dark:text-gray-400">{inv.date}</TableCell>
                                <TableCell className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{inv.invoice_number}</TableCell>
                                <TableCell className="text-xs text-gray-700 dark:text-gray-300 max-w-xs truncate">{inv.description}</TableCell>
                                <TableCell className="text-right font-mono text-xs text-gray-600 dark:text-gray-300">{inv.sale_gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-right font-mono text-xs text-gray-600 dark:text-gray-300">{inv.sp_discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-right font-mono text-xs text-gray-600 dark:text-gray-300">{inv.kb_margin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-right font-mono text-xs font-semibold text-gray-900 dark:text-gray-100">{inv.sale_net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-right font-mono text-xs text-rose-600">{inv.refund_amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-right font-mono text-xs text-emerald-600">{inv.receipt_amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-right font-mono text-xs text-blue-600">{inv.adjustment_amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-right font-mono text-xs font-bold text-gray-900 dark:text-gray-100">{inv.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-center font-mono text-xs font-semibold text-amber-600">{inv.days_over}</TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="border-t-2 border-gray-300 dark:border-gray-700 bg-gray-100/80 dark:bg-[#161619] font-bold">
                              <TableCell colSpan={3} className="text-right text-xs font-bold">Total</TableCell>
                              <TableCell className="text-right font-mono text-xs">{rep.totals.sale_gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{rep.totals.sp_discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{rep.totals.kb_margin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{rep.totals.sale_net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{rep.totals.refund_amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{rep.totals.receipt_amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{rep.totals.adjustment_amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                              <TableCell className="text-right font-mono text-xs text-primary">{rep.totals.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                              <TableCell></TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>

                      {/* Un-Adjusted Vouchers Sub-table */}
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Un-Adjusted Vouchers</h4>
                        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
                          <Table>
                            <TableHeader className="bg-gray-100 dark:bg-[#151518]">
                              <TableRow className="border-gray-200 dark:border-gray-800">
                                <TableHead className="text-[11px] font-bold text-gray-700 dark:text-gray-300">Date</TableHead>
                                <TableHead className="text-[11px] font-bold text-gray-700 dark:text-gray-300">Adj Date</TableHead>
                                <TableHead className="text-[11px] font-bold text-gray-700 dark:text-gray-300">Voucher No</TableHead>
                                <TableHead className="text-[11px] font-bold text-gray-700 dark:text-gray-300">Reference</TableHead>
                                <TableHead className="text-[11px] font-bold text-gray-700 dark:text-gray-300">Description</TableHead>
                                <TableHead className="text-[11px] font-bold text-gray-700 dark:text-gray-300 text-right">Debit</TableHead>
                                <TableHead className="text-[11px] font-bold text-gray-700 dark:text-gray-300 text-right">Credit</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rep.unadjusted_vouchers.length === 0 ? (
                                <TableRow>
                                  <TableCell className="text-xs">—</TableCell>
                                  <TableCell className="text-xs">—</TableCell>
                                  <TableCell className="text-xs">—</TableCell>
                                  <TableCell className="text-xs">—</TableCell>
                                  <TableCell className="text-xs text-gray-500">Opening Balance</TableCell>
                                  <TableCell className="text-right font-mono text-xs">0.00</TableCell>
                                  <TableCell className="text-right font-mono text-xs">0.00</TableCell>
                                </TableRow>
                              ) : (
                                rep.unadjusted_vouchers.map((uv, uvIdx) => (
                                  <TableRow key={uvIdx} className="border-gray-100 dark:border-gray-800">
                                    <TableCell className="text-xs">{uv.date}</TableCell>
                                    <TableCell className="text-xs">{uv.adj_date || "—"}</TableCell>
                                    <TableCell className="text-xs font-mono font-semibold">{uv.voucher_no}</TableCell>
                                    <TableCell className="text-xs">{uv.reference}</TableCell>
                                    <TableCell className="text-xs">{uv.description}</TableCell>
                                    <TableCell className="text-right font-mono text-xs">{uv.debit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="text-right font-mono text-xs text-emerald-600">{uv.credit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                  </TableRow>
                                ))
                              )}
                              <TableRow className="border-t border-gray-300 dark:border-gray-700 font-bold bg-gray-50 dark:bg-[#161619]">
                                <TableCell colSpan={5} className="text-right text-xs font-bold">TOTAL</TableCell>
                                <TableCell className="text-right font-mono text-xs">{rep.unadjusted_totals.debit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-right font-mono text-xs text-emerald-600">{rep.unadjusted_totals.credit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pnl">
          <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
            <CardHeader className="px-6 pt-5 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-50">Profit &amp; Loss Report</CardTitle>
                {pnl && (
                  <Button variant="outline" size="sm" onClick={printReport} className="gap-2 text-[12px]">
                    <Printer className="h-3.5 w-3.5" /> Print Report
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <div className="flex flex-col sm:flex-row gap-4 sm:items-end mb-6">
                <div className="space-y-1.5 w-full sm:w-auto"><Label className="text-[13px]">From</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-10 w-full" /></div>
                <div className="space-y-1.5 w-full sm:w-auto"><Label className="text-[13px]">To</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-10 w-full" /></div>
                <Button onClick={loadPnl} disabled={loadingPnl} className="h-10 gap-2 w-full sm:w-auto">
                  {loadingPnl ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                  Generate
                </Button>
              </div>

              {pnl && (
                <div className="space-y-8">
                  <p className="text-[12px] text-gray-400 dark:text-gray-500 font-medium">All amounts in {pnl.base_currency} (converted at current exchange rates)</p>

                  {/* Summary cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-5 rounded-xl bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/10">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <p className="text-[12px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Revenue</p>
                      </div>
                      <p className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-300">{pnl.revenue.toLocaleString()}</p>
                      <p className="text-[11px] text-emerald-500 mt-1">{pnl.invoice_count} posted invoices</p>
                    </div>
                    <div className="p-5 rounded-xl bg-rose-50 dark:bg-rose-500/5 border border-rose-100 dark:border-rose-500/10">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingDown className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                        <p className="text-[12px] font-medium text-rose-600 dark:text-rose-400 uppercase tracking-wider">Expenses</p>
                      </div>
                      <p className="text-2xl font-bold font-mono text-rose-700 dark:text-rose-300">{pnl.expenses.toLocaleString()}</p>
                      <p className="text-[11px] text-rose-500 mt-1">{pnl.expense_count} entries</p>
                    </div>
                    <div className={`p-5 rounded-xl border ${pnl.net_profit >= 0 ? "bg-blue-50 dark:bg-blue-500/5 border-blue-100 dark:border-blue-500/10" : "bg-red-50 dark:bg-red-500/5 border-red-100 dark:border-red-500/10"}`}>
                      <p className="text-[12px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Net Profit</p>
                      <p className={`text-2xl font-bold font-mono ${pnl.net_profit >= 0 ? "text-blue-700 dark:text-blue-300" : "text-red-700 dark:text-red-300"}`}>
                        {pnl.net_profit >= 0 ? "" : "-"}{Math.abs(pnl.net_profit).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Revenue by Service Type */}
                  <div>
                    <h3 className="text-[13px] font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" /> Revenue by Service Type
                    </h3>
                    <div className="space-y-2.5">
                      {Object.entries(pnl.revenue_by_type).map(([type, amount]) => (
                        <div key={type} className="flex items-center gap-3">
                          <span className="text-[12px] font-medium text-gray-600 dark:text-gray-400 w-16 flex-shrink-0">{type}</span>
                          <div className="flex-1 bg-gray-100 dark:bg-[#1a1a1d] rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${SERVICE_COLORS[type] || "bg-gray-400"}`}
                              style={{ width: `${(amount / maxRevType) * 100}%` }}
                            />
                          </div>
                          <span className="text-[12px] font-mono font-semibold text-gray-700 dark:text-gray-300 w-24 text-right">
                            {pnl.base_currency} {amount.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Invoice Ledger */}
                  {pnl.invoices.length > 0 && (
                    <div>
                      <h3 className="text-[13px] font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" /> Invoice Ledger
                      </h3>
                      <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-[#1e1e21]">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-gray-100 dark:border-[#1e1e21] bg-gray-50/50 dark:bg-[#0e0e10]/50">
                              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Invoice #</TableHead>
                              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Customer</TableHead>
                              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</TableHead>
                              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Services</TableHead>
                              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Amount</TableHead>
                              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">{pnl.base_currency} Equiv.</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pnl.invoices.map((inv) => (
                              <TableRow key={inv.id} className="border-gray-100 dark:border-[#1e1e21] hover:bg-gray-50/50 dark:hover:bg-[#151517]">
                                <TableCell className="font-mono text-[13px] font-medium text-gray-900 dark:text-gray-100">{inv.invoice_number}</TableCell>
                                <TableCell className="text-[13px] text-gray-600 dark:text-gray-300">{inv.customer}</TableCell>
                                <TableCell className="text-[13px] text-gray-500">{new Date(inv.date).toLocaleDateString()}</TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {inv.service_types.map((st) => (
                                      <span key={st} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary dark:bg-primary/20">
                                        {st}
                                      </span>
                                    ))}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-mono text-[13px] text-gray-600 dark:text-gray-300">{inv.currency} {inv.amount.toLocaleString()}</TableCell>
                                <TableCell className="text-right font-mono text-[13px] font-semibold text-gray-900 dark:text-gray-100">{inv.amount_base.toLocaleString()}</TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="border-t-2 border-gray-200 dark:border-gray-700 bg-emerald-50/50 dark:bg-emerald-500/5">
                              <TableCell colSpan={5} className="text-[12px] font-bold text-emerald-700 dark:text-emerald-300">Total Revenue</TableCell>
                              <TableCell className="text-right font-mono text-[13px] font-bold text-emerald-700 dark:text-emerald-300">{pnl.revenue.toLocaleString()}</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aging">
          <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
            <CardHeader className="px-6 pt-5 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-50">Summary Dues &amp; Aging Report</CardTitle>
                <Button onClick={loadAging} disabled={loadingAging} className="h-9 gap-2 text-[13px]">
                  {loadingAging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                  Generate
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-5">
              {aging.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="h-14 w-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                    <Clock className="h-7 w-7 text-gray-400" strokeWidth={1.5} />
                  </div>
                  <p className="text-[13px] text-gray-400">Click Generate to load the summary aging report</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-100 dark:border-[#1e1e21]">
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Customer</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Current</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">1-30 Days</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">31-60 Days</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">61-90 Days</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">90+ Days</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {aging.map((a) => (
                        <TableRow key={a.customer.id} className="border-gray-100 dark:border-[#1e1e21] hover:bg-gray-50/50 dark:hover:bg-[#151517]">
                          <TableCell className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{a.customer.name}</TableCell>
                          <TableCell className="text-right font-mono text-[13px] text-gray-600 dark:text-gray-300">{a.current.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-[13px] text-gray-600 dark:text-gray-300">{a.days_30.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-[13px] text-amber-600 dark:text-amber-400">{a.days_60.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-[13px] text-orange-600 dark:text-orange-400">{a.days_90.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-[13px] font-semibold text-red-600 dark:text-red-400">{a.over_90.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-[13px] font-bold text-gray-900 dark:text-gray-100">{a.total.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agents">
          <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
            <CardHeader className="px-6 pt-5 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-50">Agent Performance Report</CardTitle>
                {pnl && (
                  <Button variant="outline" size="sm" onClick={printReport} className="gap-2 text-[12px]">
                    <Printer className="h-3.5 w-3.5" /> Print Report
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-5">
              {!pnl ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="h-14 w-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                    <UserCheck className="h-7 w-7 text-gray-400" strokeWidth={1.5} />
                  </div>
                  <p className="text-[13px] text-gray-400">Generate Profit &amp; Loss report first to load agent data</p>
                </div>
              ) : pnl.agent_performance.length === 0 ? (
                <p className="text-center py-12 text-[13px] text-gray-400">No agents registered or sales recorded in this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-100 dark:border-[#1e1e21]">
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Agent Name</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Email</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Invoices Posted</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Total Sales ({pnl.base_currency})</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Commission Earned ({pnl.base_currency})</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pnl.agent_performance.map((ap) => (
                        <TableRow key={ap.id} className="border-gray-100 dark:border-[#1e1e21] hover:bg-gray-50/50 dark:hover:bg-[#151517]">
                          <TableCell className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{ap.name}</TableCell>
                          <TableCell className="text-[13px] text-gray-500">{ap.email}</TableCell>
                          <TableCell className="text-right font-mono text-[13px] text-gray-600 dark:text-gray-300">{ap.invoice_count.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">{ap.sales.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-[13px] font-bold text-gray-900 dark:text-gray-100">{ap.commission.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}