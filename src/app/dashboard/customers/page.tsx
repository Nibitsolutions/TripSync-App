"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Plus, BookOpen, ArrowUpRight, ArrowDownRight, X, ArrowLeft, UserPlus, Search,
  Pencil, Trash2, ShieldAlert
} from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { formatDateDDMMYYYY } from "@/lib/date-utils";
import { TypeToSearch, SearchOption } from "@/components/ui/type-to-search";
import { CustomerForm, CustomerRecord, customerTypeLabel } from "@/components/customers/CustomerForm";
import { apiFetch, notify } from "@/lib/notify";

type Customer = CustomerRecord;

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Modal / Form state (form fields live in the shared CustomerForm)
  const [showModal, setShowModal] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);

  // Ledger State
  const [ledgerCustomer, setLedgerCustomer] = useState<string | null>(null);
  const [ledgerCustomerSearch, setLedgerCustomerSearch] = useState("");
  const [ledgerData, setLedgerData] = useState<Record<string, unknown> | null>(null);
  const [ledgerInvNo, setLedgerInvNo] = useState("");
  const [ledgerFromDate, setLedgerFromDate] = useState("");
  const [ledgerToDate, setLedgerToDate] = useState("");
  const [loadingLedgerFilter, setLoadingLedgerFilter] = useState(false);

  const customerOptions: SearchOption[] = customers.map((c) => ({
    value: c._id,
    label: c.name,
    code: c.code,
  }));

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ customers?: Customer[] }>("/api/customers");
      setCustomers(data.customers || []);
    } catch (err) {
      notify.error("Failed to load customers", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNewModal = () => {
    setEditCustomer(null);
    setShowModal(true);
    setLedgerCustomer(null);
  };

  const openEditModal = (c: Customer) => {
    setEditCustomer(c);
    setShowModal(true);
    setLedgerCustomer(null);
  };

  async function handleDelete(id: string, custName: string) {
    if (!confirm(`Are you sure you want to delete customer "${custName}"?`)) return;
    try {
      await apiFetch(`/api/customers/${id}`, { method: "DELETE" });
      notify.success(`Customer "${custName}" deleted`);
      load();
    } catch (err) {
      notify.error(`Failed to delete customer "${custName}"`, err);
    }
  }

  async function viewLedger(id: string, invNo = ledgerInvNo, from = ledgerFromDate, to = ledgerToDate, custSearch = ledgerCustomerSearch) {
    setShowModal(false);
    let targetId = id;
    if (custSearch.trim()) {
      const q = custSearch.trim().toLowerCase();
      const found = customers.find((c) => c.name.toLowerCase().includes(q) || (c.code && c.code.toLowerCase().includes(q)));
      if (found) {
        targetId = found._id;
      } else {
        notify.warning("No customer matches your search", "Showing the ledger of the currently selected customer.");
      }
    } else {
      const currentCust = customers.find((c) => c._id === id);
      if (currentCust) setLedgerCustomerSearch(currentCust.name);
    }

    setLedgerCustomer(targetId);
    setLoadingLedgerFilter(true);
    const params = new URLSearchParams();
    if (invNo.trim()) params.set("invoice_number", invNo.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    try {
      setLedgerData(await apiFetch(`/api/customers/${targetId}/ledger?${params.toString()}`));
    } catch (err) {
      notify.error("Failed to load customer ledger", err);
    } finally {
      setLoadingLedgerFilter(false);
    }
  }

  const filteredCustomers = customers.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.code && c.code.toLowerCase().includes(q)) ||
      (c.ntn_number && c.ntn_number.toLowerCase().includes(q)) ||
      (c.spo_name && c.spo_name.toLowerCase().includes(q)) ||
      (c.customer_type && c.customer_type.toLowerCase().includes(q)) ||
      customerTypeLabel(c.customer_type).toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">Customers</h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">Manage customer profiles, credit limits, and ledger accounts</p>
        </div>
        {!showModal && !ledgerCustomer && (
          <Button
            onClick={openNewModal}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" /> New Customer
          </Button>
        )}
      </div>

      {/* Expanded Customer Creation / Edit Form Card */}
      {showModal && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113] shadow-lg">
          <CardHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between bg-slate-50/50 dark:bg-[#151518]">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <UserPlus className="h-5 w-5 text-primary" />
              {editCustomer ? `Edit Customer — ${editCustomer.name}` : "Create New Customer Account"}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowModal(false)} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-6">
            <CustomerForm
              key={editCustomer?._id || "new"}
              customers={customers}
              editCustomer={editCustomer}
              onSaved={() => { setShowModal(false); setEditCustomer(null); load(); }}
              onCancel={() => setShowModal(false)}
            />
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

                {/* Filter Controls for Customer Ledger */}
                <div className="flex flex-col sm:flex-row flex-wrap items-end gap-3 p-3 rounded-lg bg-slate-50 dark:bg-[#151518] border border-slate-200 dark:border-slate-800">
                  <div className="space-y-1 flex-1 min-w-[180px]">
                    <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Search Customer Name / ID</Label>
                    <TypeToSearch
                      placeholder="e.g. Customer Name or Code"
                      value={ledgerCustomerSearch}
                      onChange={(val) => setLedgerCustomerSearch(val)}
                      onSelectOption={(opt) => setLedgerCustomerSearch(opt.label)}
                      options={customerOptions}
                      className="h-8 text-xs bg-white dark:bg-[#111113]"
                    />
                  </div>
                  <div className="space-y-1 flex-1 min-w-[140px]">
                    <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Invoice Number</Label>
                    <Input
                      placeholder="e.g. 158"
                      value={ledgerInvNo}
                      onChange={(e) => setLedgerInvNo(e.target.value)}
                      className="h-8 text-xs bg-white dark:bg-[#111113]"
                    />
                  </div>
                  <div className="space-y-1 w-full sm:w-36">
                    <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">From Date</Label>
                    <DatePicker
                      value={ledgerFromDate}
                      onChange={(val) => setLedgerFromDate(val)}
                      className="h-8 text-xs bg-white dark:bg-[#111113]"
                    />
                  </div>
                  <div className="space-y-1 w-full sm:w-36">
                    <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">To Date</Label>
                    <DatePicker
                      value={ledgerToDate}
                      onChange={(val) => setLedgerToDate(val)}
                      className="h-8 text-xs bg-white dark:bg-[#111113]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => ledgerCustomer && viewLedger(ledgerCustomer)}
                      disabled={loadingLedgerFilter}
                      className="h-8 text-xs gap-1 cursor-pointer"
                    >
                      <Search className="h-3.5 w-3.5" /> Filter
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setLedgerInvNo("");
                        setLedgerFromDate("");
                        setLedgerToDate("");
                        if (ledgerCustomer) viewLedger(ledgerCustomer, "", "", "");
                      }}
                      className="h-8 text-xs bg-white dark:bg-[#111113] cursor-pointer"
                    >
                      Reset
                    </Button>
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
                          <TableCell className="text-[13px] text-gray-500 font-mono">{formatDateDDMMYYYY(e.date as string)}</TableCell>
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

      {/* Main Customers Register Table Card */}
      <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
        <CardHeader className="px-6 pt-5 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-50 flex items-center gap-2">
            <span>Customer Register</span>
            <Badge variant="secondary" className="text-[11px] font-mono font-normal">
              {filteredCustomers.length} {filteredCustomers.length === 1 ? "customer" : "customers"}
            </Badge>
          </CardTitle>
          <div className="w-full sm:w-64">
            <Input
              placeholder="Search code, title, NTN, SPO..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-[12px]"
            />
          </div>
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
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Code *</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Title / Name *</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Type *</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">GL Account *</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">SPO *</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Contact</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Credit Limit</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Balance</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-[13px] text-gray-400">
                        No customers found matching your search.
                      </TableCell>
                    </TableRow>
                  ) : filteredCustomers.map((c) => (
                    <TableRow key={c._id} className="border-gray-100 dark:border-[#1e1e21] hover:bg-gray-50/50 dark:hover:bg-[#151517]">
                      <TableCell className="text-[12px] font-mono font-bold text-primary">{c.code || "-"}</TableCell>
                      <TableCell className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                        <div>{c.name}</div>
                        {c.short_name && <span className="text-[11px] text-slate-400 font-normal">{c.short_name}</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-semibold">
                          {customerTypeLabel(c.customer_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[12px] font-mono text-gray-600 dark:text-gray-300">{c.gl_account || "101001"}</TableCell>
                      <TableCell className="text-[12px] text-gray-600 dark:text-gray-300">{c.spo_name || "—"}</TableCell>
                      <TableCell className="text-[12px] text-gray-500">
                        <div>{c.phone_1 || c.contact_info?.phone || "-"}</div>
                        {(c.contact_person_email || c.contact_info?.email) && (
                          <div className="text-[11px] text-slate-400">{c.contact_person_email || c.contact_info?.email}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[13px] text-gray-600 dark:text-gray-300">
                        {c.credit_limit?.toLocaleString() ?? <span className="text-gray-400">No limit</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                        {c.current_balance.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 cursor-pointer" onClick={() => openEditModal(c)}>
                            <Pencil className="h-3 w-3 text-blue-500" /> Edit
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 cursor-pointer" onClick={() => viewLedger(c._id)}>
                            <BookOpen className="h-3 w-3 text-emerald-500" /> Ledger
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(c._id, c.name)}>
                            <Trash2 className="h-3.5 w-3.5" />
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
