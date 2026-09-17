"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, BookOpen, ArrowUpRight, ArrowDownRight, X, ArrowLeft, UserPlus } from "lucide-react";

interface Customer {
  _id: string;
  name: string;
  code?: string;
  contact_info: { phone?: string; email?: string };
  credit_limit: number | null;
  current_balance: number;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [ledgerCustomer, setLedgerCustomer] = useState<string | null>(null);
  const [ledgerData, setLedgerData] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/customers");
    const data = await res.json();
    setCustomers(data.customers || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    const res = await fetch("/api/customers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, code: code || undefined, contact_info: { phone, email }, credit_limit: creditLimit ? parseFloat(creditLimit) : null }),
    });
    if (res.ok) { setShowNew(false); setName(""); setCode(""); setPhone(""); setEmail(""); setCreditLimit(""); load(); }
  }

  async function viewLedger(id: string) {
    setShowNew(false);
    setLedgerCustomer(id);
    const res = await fetch(`/api/customers/${id}/ledger`);
    setLedgerData(await res.json());
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">Customers</h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">Manage your customer accounts and balances</p>
        </div>
        {!showNew && !ledgerCustomer && (
          <Button
            onClick={() => { setShowNew(true); setLedgerCustomer(null); }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" /> New Customer
          </Button>
        )}
      </div>

      {/* Inline Create Customer Form Card */}
      {showNew && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113] shadow-md">
          <CardHeader className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <UserPlus className="h-5 w-5 text-primary" /> Add New Customer
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowNew(false)} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-5">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Name *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 text-[13px]" placeholder="Customer name" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Customer Code / ID</Label>
                  <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="h-10 font-mono text-[13px]" placeholder="Auto-generated (e.g. CUST-000001)" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10 text-[13px]" placeholder="Phone number" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 text-[13px]" placeholder="Email address" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Credit Limit (leave empty for no limit)</Label>
                <Input type="number" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} className="h-10 font-mono text-[13px]" placeholder="0" />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
                <Button onClick={create} disabled={!name} className="gap-2">
                  <Plus className="h-4 w-4" /> Create Customer
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inline Customer Ledger Card */}
      {ledgerCustomer && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113] shadow-md">
          <CardHeader className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLedgerCustomer(null)}
                className="h-8 gap-1.5 text-xs font-semibold cursor-pointer border-slate-300 dark:border-slate-700"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Customers
              </Button>
              <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
                <BookOpen className="h-5 w-5 text-primary" /> Customer Ledger
              </CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setLedgerCustomer(null)} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-5">
            {ledgerData ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between gap-4 p-4 bg-gray-50 dark:bg-[#0e0e10] rounded-xl border border-gray-100 dark:border-[#1e1e21]">
                  <div>
                    <p className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">{(ledgerData.customer as Record<string, unknown>)?.name as string}</p>
                    <p className="text-[12px] text-gray-400 mt-1">Credit Limit: {((ledgerData.customer as Record<string, unknown>)?.credit_limit as number)?.toLocaleString() ?? "No limit"}</p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Current Balance</p>
                    <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-50 mt-1">{(ledgerData.current_balance as number)?.toLocaleString()}</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-100 dark:border-[#1e1e21]">
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Type</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Reference</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Debit</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {((ledgerData.entries as Array<Record<string, unknown>>) || []).map((e, i) => (
                        <TableRow key={i} className="border-gray-100 dark:border-[#1e1e21]">
                          <TableCell className="text-[13px] text-gray-500">{new Date(e.date as string).toLocaleDateString()}</TableCell>
                          <TableCell className="text-[13px] capitalize text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                            {(e.debit as number) > 0 ? <ArrowUpRight className="h-3 w-3 text-red-500" /> : <ArrowDownRight className="h-3 w-3 text-emerald-500" />}
                            {(e.type as string).replace("_", " ")}
                          </TableCell>
                          <TableCell className="font-mono text-[13px] text-gray-500">{e.reference as string}</TableCell>
                          <TableCell className="text-right font-mono text-[13px] text-red-600 dark:text-red-400">{(e.debit as number) > 0 ? (e.debit as number).toLocaleString() : ""}</TableCell>
                          <TableCell className="text-right font-mono text-[13px] text-emerald-600 dark:text-emerald-400">{(e.credit as number) > 0 ? (e.credit as number).toLocaleString() : ""}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Customers Table Card */}
      <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
        <CardHeader className="px-6 pt-5 pb-3"><CardTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-50">All Customers</CardTitle></CardHeader>
        <CardContent className="px-6 pb-5">
          {loading ? (
            <div className="flex items-center justify-center py-12"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-100 dark:border-[#1e1e21]">
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Customer ID</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Name</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Phone</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Email</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Credit Limit</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Balance</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-[13px] text-gray-400">No customers yet</TableCell></TableRow>
                  ) : customers.map((c) => (
                    <TableRow key={c._id} className="border-gray-100 dark:border-[#1e1e21] hover:bg-gray-50/50 dark:hover:bg-[#151517]">
                      <TableCell className="text-[12px] font-mono font-bold text-primary">{c.code || "-"}</TableCell>
                      <TableCell className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{c.name}</TableCell>
                      <TableCell className="text-[13px] text-gray-500">{c.contact_info?.phone || "-"}</TableCell>
                      <TableCell className="text-[13px] text-gray-500">{c.contact_info?.email || "-"}</TableCell>
                      <TableCell className="text-right font-mono text-[13px] text-gray-600 dark:text-gray-300">{c.credit_limit?.toLocaleString() ?? <span className="text-gray-400">No limit</span>}</TableCell>
                      <TableCell className="text-right font-mono text-[13px] font-semibold text-gray-900 dark:text-gray-100">{c.current_balance.toLocaleString()}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px] cursor-pointer" onClick={() => viewLedger(c._id)}>
                          <BookOpen className="h-3.5 w-3.5" /> Ledger
                        </Button>
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
