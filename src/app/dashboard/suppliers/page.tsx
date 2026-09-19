"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Plus, Phone, Mail, BadgeDollarSign, Loader2, Landmark, X, ArrowLeft, Search } from "lucide-react";

interface Supplier {
  _id: string;
  name: string;
  code: string;
  currency: string;
  contact_email?: string;
  contact_phone?: string;
  current_balance: number;
}

interface Booking {
  _id: string;
  booking_reference: string;
  service_type: string;
  gds_pnr?: string;
  total_cost: number;
  created_at: string;
  status?: string;
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [currency, setCurrency] = useState("PKR");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Ledger state
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierBookings, setSupplierBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerFromDate, setLedgerFromDate] = useState("");
  const [ledgerToDate, setLedgerToDate] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/suppliers");
    const data = await res.json();
    setSuppliers(data.suppliers || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    const res = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, code, currency, contact_email: email, contact_phone: phone }),
    });
    if (res.ok) {
      setShowNew(false);
      setName("");
      setCode("");
      setEmail("");
      setPhone("");
      load();
    } else {
      const d = await res.json();
      alert(d.error || "Failed to create supplier");
    }
  }

  async function openSupplierLedger(sup: Supplier, search = ledgerSearch, from = ledgerFromDate, to = ledgerToDate) {
    setShowNew(false);
    setSelectedSupplier(sup);
    setLoadingBookings(true);
    const params = new URLSearchParams({ supplier_id: sup._id });
    if (search.trim()) params.set("search", search.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const res = await fetch(`/api/reports/supplier-ledger?${params.toString()}`);
    const data = await res.json();
    setSupplierBookings(data.entries || []);
    setLoadingBookings(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">Suppliers</h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">Manage vendor directories and running balances</p>
        </div>
        {!showNew && !selectedSupplier && (
          <Button
            onClick={() => { setShowNew(true); setSelectedSupplier(null); }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Add Supplier
          </Button>
        )}
      </div>

      {/* Inline Create Supplier Form Card */}
      {showNew && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113] shadow-md">
          <CardHeader className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <Landmark className="h-5 w-5 text-primary" /> Add New Supplier
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowNew(false)} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-5">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Supplier Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. flydubai" className="h-10 text-[13px]" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Supplier Code</Label>
                  <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. FZ" className="h-10 text-[13px]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Currency</Label>
                  <Select value={currency} onValueChange={(v) => v && setCurrency(v)}>
                    <SelectTrigger className="h-10 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{["PKR", "USD", "GBP", "SAR", "AED"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Contact Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. +971 4 292 2222" className="h-10 text-[13px]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Contact Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. vendor@supplier.com" className="h-10 text-[13px]" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
                <Button onClick={create} disabled={!name} className="gap-2">
                  <Landmark className="h-4 w-4" /> Add Supplier
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inline Supplier Ledger Card */}
      {selectedSupplier && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113] shadow-md">
          <CardHeader className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedSupplier(null)}
                className="h-8 gap-1.5 text-xs font-semibold cursor-pointer border-slate-300 dark:border-slate-700"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Suppliers
              </Button>
              <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
                <BadgeDollarSign className="h-5 w-5 text-primary" /> Supplier Ledger — {selectedSupplier.name}
              </CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedSupplier(null)} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-5">
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#0e0e10]/50 border border-gray-100 dark:border-[#1e1e21] flex justify-between items-center">
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Total Outstanding Owed</p>
                  <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-50 mt-1">
                    {selectedSupplier.currency} {selectedSupplier.current_balance.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Filter Controls for Supplier Ledger */}
              <div className="flex flex-col sm:flex-row flex-wrap items-end gap-3 p-3 rounded-lg bg-slate-50 dark:bg-[#151518] border border-slate-200 dark:border-slate-800">
                <div className="space-y-1 flex-1 min-w-[140px]">
                  <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Search Ref / PNR / Name</Label>
                  <Input
                    placeholder="e.g. PNR / Booking #"
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    className="h-8 text-xs bg-white dark:bg-[#111113]"
                  />
                </div>
                <div className="space-y-1 w-full sm:w-36">
                  <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">From Date</Label>
                  <Input
                    type="date"
                    value={ledgerFromDate}
                    onChange={(e) => setLedgerFromDate(e.target.value)}
                    className="h-8 text-xs bg-white dark:bg-[#111113]"
                  />
                </div>
                <div className="space-y-1 w-full sm:w-36">
                  <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">To Date</Label>
                  <Input
                    type="date"
                    value={ledgerToDate}
                    onChange={(e) => setLedgerToDate(e.target.value)}
                    className="h-8 text-xs bg-white dark:bg-[#111113]"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => selectedSupplier && openSupplierLedger(selectedSupplier)}
                    disabled={loadingBookings}
                    className="h-8 text-xs gap-1 cursor-pointer"
                  >
                    <Search className="h-3.5 w-3.5" /> Filter
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setLedgerSearch("");
                      setLedgerFromDate("");
                      setLedgerToDate("");
                      if (selectedSupplier) openSupplierLedger(selectedSupplier, "", "", "");
                    }}
                    className="h-8 text-xs bg-white dark:bg-[#111113] cursor-pointer"
                  >
                    Reset
                  </Button>
                </div>
              </div>
              
              {loadingBookings ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : supplierBookings.length === 0 ? (
                <p className="text-center py-10 text-[13px] text-gray-400">No transactions recorded for this supplier.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-[#1e1e21]">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 dark:bg-[#0e0e10]/30 border-gray-100 dark:border-[#1e1e21]">
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Reference</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Type</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">PNR</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Cost (Owed)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {supplierBookings.map((b) => (
                        <TableRow key={b._id} className="border-gray-100 dark:border-[#1e1e21]">
                          <TableCell className="font-mono text-[13px] font-medium text-gray-900 dark:text-gray-100">{b.booking_reference}</TableCell>
                          <TableCell className="text-[13px] text-gray-500">{b.service_type}</TableCell>
                          <TableCell className="font-mono text-[12px] text-gray-500">{b.gds_pnr || "—"}</TableCell>
                          <TableCell className="text-[12px] text-gray-500">{new Date(b.created_at).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right font-mono text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                            {selectedSupplier.currency} {b.total_cost.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Suppliers Table Card */}
      <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
        <CardHeader className="px-6 pt-5 pb-3">
          <CardTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-50">Supplier Records</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-100 dark:border-[#1e1e21]">
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Supplier Name</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Code</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Currency</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Owed Balance</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Contact Details</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-12 text-[13px] text-gray-400">No suppliers registered yet.</TableCell></TableRow>
                  ) : suppliers.map((sup) => (
                    <TableRow key={sup._id} className="border-gray-100 dark:border-[#1e1e21] hover:bg-gray-50/50 dark:hover:bg-[#151517]">
                      <TableCell className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 py-3.5">
                        <Building2 className="h-4 w-4 text-gray-400" />
                        {sup.name}
                      </TableCell>
                      <TableCell className="font-mono text-[13px] text-gray-500">{sup.code || "—"}</TableCell>
                      <TableCell className="text-[13px] text-gray-500">{sup.currency}</TableCell>
                      <TableCell className="text-right font-mono text-[13px] font-bold text-gray-900 dark:text-gray-100">
                        {sup.current_balance.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-[12px] text-gray-600 dark:text-gray-300">
                        {sup.contact_phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3 text-gray-400" /> {sup.contact_phone}</p>}
                        {sup.contact_email && <p className="flex items-center gap-1 mt-0.5"><Mail className="h-3 w-3 text-gray-400" /> {sup.contact_email}</p>}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px] cursor-pointer" onClick={() => openSupplierLedger(sup)}>
                          <BadgeDollarSign className="h-3.5 w-3.5" /> Ledger
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