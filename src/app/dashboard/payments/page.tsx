"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Wallet, Coins, Loader2, Printer, X, ArrowLeft } from "lucide-react";

interface Payment {
  _id: string;
  customer_id: { _id: string; name: string } | string;
  amount: number;
  currency: string;
  payment_method: string;
  status: string;
  created_at: string;
  allocated_amount: number;
  unallocated_amount: number;
}

interface Customer { _id: string; name: string; }

interface LedgerEntry {
  id: string;
  type: "invoice" | "payment" | "credit_note";
  date: string;
  reference: string;
  debit: number;
  credit: number;
  status: string;
}

interface AllocationEntry {
  _id: string;
  invoice_id: string;
  allocated_amount: number;
}

interface InvoiceAllocationRow {
  invoice_id: string;
  invoice_number: string;
  date: string;
  total: number;
  allocated: number;
  balance: number;
  allocateInput: string;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("PKR");
  const [method, setMethod] = useState("");

  // Allocation state
  const [allocatingPayment, setAllocatingPayment] = useState<Payment | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [allocationRows, setAllocationRows] = useState<InvoiceAllocationRow[]>([]);
  const [submittingAllocation, setSubmittingAllocation] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/payments");
    const data = await res.json();
    setPayments(data.payments || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/customers").then((r) => r.json()).then((d) => setCustomers(d.customers || []));
  }, [load]);

  async function create() {
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: customerId, amount: parseFloat(amount), currency, payment_method: method }),
    });
    if (res.ok) {
      setShowNew(false);
      setCustomerId("");
      setAmount("");
      setMethod("");
      load();
    } else {
      const d = await res.json();
      alert(d.error);
    }
  }

  // Load unpaid invoices and their current allocations for the customer
  const startAllocation = async (payment: Payment) => {
    setShowNew(false);
    setAllocatingPayment(payment);
    setLoadingInvoices(true);
    setAllocationRows([]);
    
    const custId = payment.customer_id && typeof payment.customer_id === "object" ? payment.customer_id._id : (typeof payment.customer_id === "string" ? payment.customer_id : "");
    try {
      const res = await fetch(`/api/customers/${custId}/ledger`);
      const data = await res.json();
      
      const invoices = (data.entries || []).filter((e: LedgerEntry) => e.type === "invoice" && e.status === "Posted");
      const allocations = (data.allocations || []) as AllocationEntry[];
      
      // Calculate balance for each invoice
      const rows: InvoiceAllocationRow[] = invoices.map((inv: LedgerEntry) => {
        const invoiceAllocated = allocations
          .filter((a: AllocationEntry) => a.invoice_id === inv.id)
          .reduce((sum: number, a: AllocationEntry) => sum + a.allocated_amount, 0);
          
        const balance = inv.debit - invoiceAllocated;
        
        return {
          invoice_id: inv.id,
          invoice_number: inv.reference,
          date: inv.date,
          total: inv.debit,
          allocated: invoiceAllocated,
          balance: balance,
          allocateInput: "",
        };
      }).filter((row: InvoiceAllocationRow) => row.balance > 0);
      
      setAllocationRows(rows);
    } catch (err) {
      console.error(err);
      alert("Failed to load customer outstanding invoices");
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleAllocationInputChange = (invoiceId: string, val: string) => {
    setAllocationRows(prev =>
      prev.map(row => (row.invoice_id === invoiceId ? { ...row, allocateInput: val } : row))
    );
  };

  async function submitAllocation() {
    if (!allocatingPayment) return;
    setSubmittingAllocation(true);
    
    const allocationsToSubmit = allocationRows
      .map(row => ({
        invoice_id: row.invoice_id,
        amount: parseFloat(row.allocateInput) || 0,
      }))
      .filter(a => a.amount > 0);
      
    if (allocationsToSubmit.length === 0) {
      alert("Please enter a valid amount for at least one invoice.");
      setSubmittingAllocation(false);
      return;
    }
    
    const totalAllocated = allocationsToSubmit.reduce((sum, a) => sum + a.amount, 0);
    if (totalAllocated > allocatingPayment.unallocated_amount) {
      alert(`Allocated total (${totalAllocated.toLocaleString()}) cannot exceed the unallocated payment balance (${allocatingPayment.unallocated_amount.toLocaleString()})`);
      setSubmittingAllocation(false);
      return;
    }
    
    try {
      const res = await fetch(`/api/payments/${allocatingPayment._id}/allocate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allocations: allocationsToSubmit }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to submit allocation");
      } else {
        setAllocatingPayment(null);
        load();
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred");
    } finally {
      setSubmittingAllocation(false);
    }
  }

  const statusStyles: Record<string, string> = {
    Posted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    Voided: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">Payments</h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">Track and record customer payments</p>
        </div>
        {!showNew && !allocatingPayment && (
          <Button
            onClick={() => { setShowNew(true); setAllocatingPayment(null); }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Record Payment
          </Button>
        )}
      </div>

      {/* Inline Record Payment Form Card */}
      {showNew && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113] shadow-md">
          <CardHeader className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <Wallet className="h-5 w-5 text-primary" /> Record New Payment
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowNew(false)} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-5">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Customer *</Label>
                <Select value={customerId} onValueChange={(v) => v && setCustomerId(v)}>
                  <SelectTrigger className="h-10 text-[13px]"><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>{customers.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Amount *</Label>
                  <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 font-mono text-[13px]" placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Currency</Label>
                  <Select value={currency} onValueChange={(v) => v && setCurrency(v)}>
                    <SelectTrigger className="h-10 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{["PKR", "USD", "GBP", "SAR", "AED"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Payment Method *</Label>
                <Select value={method} onValueChange={(v) => v && setMethod(v)}>
                  <SelectTrigger className="h-10 text-[13px]"><SelectValue placeholder="Select method" /></SelectTrigger>
                  <SelectContent>{["Cash", "Bank Transfer", "Cheque", "Online"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
                <Button onClick={create} disabled={!customerId || !amount || !method} className="gap-2">
                  <Wallet className="h-4 w-4" /> Record Payment
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inline Allocate Payment Card */}
      {allocatingPayment && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113] shadow-md">
          <CardHeader className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAllocatingPayment(null)}
                className="h-8 gap-1.5 text-xs font-semibold cursor-pointer border-slate-300 dark:border-slate-700"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Payments
              </Button>
              <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
                <Coins className="h-5 w-5 text-primary" /> Allocate Payment
              </CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setAllocatingPayment(null)} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-5">
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#0e0e10]/30 border border-gray-100 dark:border-[#1e1e21] grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Customer</p>
                  <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 mt-0.5">
                    {allocatingPayment.customer_id && typeof allocatingPayment.customer_id === "object" ? allocatingPayment.customer_id.name : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Payment Amount</p>
                  <p className="text-[13px] font-bold text-gray-900 dark:text-gray-100 mt-0.5 text-right font-mono">
                    {allocatingPayment.currency} {allocatingPayment.amount.toLocaleString()}
                  </p>
                </div>
                <div className="col-span-2 border-t border-gray-200/50 dark:border-[#1e1e21] pt-3 flex justify-between items-center">
                  <span className="text-[12px] font-semibold text-gray-500">Unallocated Balance:</span>
                  <span className="text-sm font-bold text-primary font-mono">
                    {allocatingPayment.currency} {allocatingPayment.unallocated_amount.toLocaleString()}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-[12px] font-semibold text-gray-700 dark:text-gray-300 mb-3">Outstanding Invoices</p>
                
                {loadingInvoices ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                ) : allocationRows.length === 0 ? (
                  <p className="text-center py-8 text-[13px] text-gray-400 bg-gray-50/50 dark:bg-[#0e0e10]/10 rounded-xl border border-dashed border-gray-200 dark:border-[#1e1e21]">
                    No outstanding posted invoices found for this customer.
                  </p>
                ) : (
                  <div className="overflow-x-auto border border-gray-100 dark:border-[#1e1e21] rounded-xl">
                    <Table>
                      <TableHeader className="bg-gray-50/50 dark:bg-[#0e0e10]/30">
                        <TableRow className="border-gray-100 dark:border-[#1e1e21]">
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Invoice #</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Total</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Remaining</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 w-[180px] text-right">Allocate Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allocationRows.map((row) => (
                          <TableRow key={row.invoice_id} className="border-gray-100 dark:border-[#1e1e21]">
                            <TableCell className="font-mono text-[13px] font-medium text-gray-900 dark:text-gray-100">{row.invoice_number}</TableCell>
                            <TableCell className="text-[12px] text-gray-500">{new Date(row.date).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right font-mono text-[13px] text-gray-600 dark:text-gray-300">{row.total.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">{row.balance.toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                placeholder="0.00"
                                value={row.allocateInput}
                                onChange={(e) => handleAllocationInputChange(row.invoice_id, e.target.value)}
                                className="h-9 font-mono text-[13px] text-right w-full max-w-[150px] inline-block"
                                max={Math.min(allocatingPayment.unallocated_amount, row.balance)}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <div className="flex gap-3 justify-end pt-3 border-t border-gray-100 dark:border-[#1e1e21]">
                <Button variant="outline" onClick={() => setAllocatingPayment(null)} disabled={submittingAllocation} className="h-10 cursor-pointer">
                  Cancel
                </Button>
                <Button onClick={submitAllocation} disabled={submittingAllocation || allocationRows.length === 0} className="h-10 gap-2 cursor-pointer">
                  {submittingAllocation && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirm Allocation
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Payments Table Card */}
      <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
        <CardHeader className="px-6 pt-5 pb-3"><CardTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-50">All Payments</CardTitle></CardHeader>
        <CardContent className="px-6 pb-5">
          {loading ? (
            <div className="flex items-center justify-center py-12"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-100 dark:border-[#1e1e21]">
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Customer</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Amount</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Currency</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Method</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-[13px] text-gray-400">No payments yet</TableCell></TableRow>
                  ) : payments.map((p) => (
                    <TableRow key={p._id} className="border-gray-100 dark:border-[#1e1e21] hover:bg-gray-50/50 dark:hover:bg-[#151517]">
                      <TableCell className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{p.customer_id && typeof p.customer_id === "object" ? p.customer_id.name : "-"}</TableCell>
                      <TableCell className="text-right font-mono text-[13px]">
                        <div className="font-semibold text-gray-900 dark:text-gray-100">{p.amount.toLocaleString()}</div>
                        {p.allocated_amount > 0 && (
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            Allocated: {p.allocated_amount.toLocaleString()} | Left: {p.unallocated_amount.toLocaleString()}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-[13px] text-gray-500">{p.currency}</TableCell>
                      <TableCell className="text-[13px] text-gray-600 dark:text-gray-300">{p.payment_method}</TableCell>
                      <TableCell><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${statusStyles[p.status] || ""}`}>{p.status}</span></TableCell>
                      <TableCell className="text-[13px] text-gray-500">{new Date(p.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex gap-1.5">
                          {p.status === "Posted" && p.unallocated_amount > 0 && (
                            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px] cursor-pointer" onClick={() => startAllocation(p)}>
                              <Coins className="h-3 w-3" /> Allocate
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]" onClick={() => window.open(`/dashboard/payments/${p._id}/print`, "_blank")}>
                            <Printer className="h-3.5 w-3.5" /> Print Receipt
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
