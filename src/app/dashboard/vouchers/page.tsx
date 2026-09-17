"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { numberToWords } from "@/lib/numberToWords";
import {
  Plus,
  Trash2,
  Search,
  FileCheck,
  Printer,
  RefreshCw,
  ChevronRight,
  ArrowLeft,
  FileText,
  Save,
  X,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type VoucherType = "RV" | "PV" | "JV" | "DN" | "CD";
type VoucherStatus = "Draft" | "Posted" | "Voided";

interface VoucherEntry {
  branch: string;
  ref_code: string;
  ref_no: string;
  adj_date: string;
  description: string;
  account_code: string;
  debit: number;
  credit: number;
}

interface Voucher {
  _id: string;
  voucher_number: string;
  voucher_type: VoucherType;
  voucher_date: string;
  name_on_voucher: string;
  manual_receipt_no: string;
  cost_center: string;
  cheque_no: string;
  cheque_status: string;
  debit_account: string;
  entries: VoucherEntry[];
  total_debit: number;
  total_credit: number;
  amount_in_words: string;
  remarks: string;
  print_format: string;
  status: VoucherStatus;
  createdAt: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const VOUCHER_TYPES: { value: VoucherType; label: string; color: string }[] = [
  { value: "RV", label: "RV - Receipt Voucher", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-300 dark:border-green-800" },
  { value: "PV", label: "PV - Payment Voucher", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-300 dark:border-red-800" },
  { value: "JV", label: "JV - Journal Voucher", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-300 dark:border-blue-800" },
  { value: "DN", label: "DN - Debit Note", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-300 dark:border-orange-800" },
  { value: "CD", label: "CD - Cash Deposit", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-300 dark:border-purple-800" },
];

const STATUS_COLORS: Record<VoucherStatus, string> = {
  Draft: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  Posted: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Voided: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const PRINT_FORMATS = ["In House", "Standard", "Compact", "Detailed"];
const CHEQUE_STATUSES = ["", "Cleared", "Pending", "Bounced", "Cancelled"];

function blankEntry(): VoucherEntry {
  return {
    branch: "01",
    ref_code: "",
    ref_no: "",
    adj_date: "",
    description: "",
    account_code: "",
    debit: 0,
    credit: 0,
  };
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function blankForm(type: VoucherType = "RV") {
  return {
    voucher_type: type,
    voucher_date: todayStr(),
    name_on_voucher: "",
    manual_receipt_no: "",
    cost_center: "",
    cheque_no: "",
    cheque_status: "",
    debit_account: "",
    entries: [blankEntry()],
    amount_in_words: "",
    remarks: "",
    print_format: "In House",
  };
}


// ─── Main Component ──────────────────────────────────────────────────────────

const BANK_ACCOUNTS = [
  { name: "MBL - Meezan Bank Ltd", account: "MBL - 0101-0102030 (Operating)" },
  { name: "HBL - Habib Bank Ltd", account: "HBL - 2341-998201 (Main Branch)" },
  { name: "UBL - United Bank Ltd", account: "UBL - 1102-887410 (Corporate)" },
  { name: "MCB - MCB Bank Ltd", account: "MCB - 5560-120934 (Collection)" },
  { name: "BAFL - Bank Alfalah", account: "BAFL - 8890-001243 (Operations)" },
  { name: "SCB - Standard Chartered", account: "SCB - 0122-998765 (Treasury)" },
  { name: "ABL - Allied Bank Ltd", account: "ABL - 4432-119902 (Clearing)" },
  { name: "Cash in Hand", account: "Cash in Hand - Main Vault" },
  { name: "Petty Cash", account: "Petty Cash Account" },
];

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Form View state
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<Voucher | null>(null);
  const [createType, setCreateType] = useState<VoucherType>("RV");

  // Form state
  const [form, setForm] = useState(blankForm("RV"));
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);

  // Account suggestions & Invoices
  const [accountSuggestions, setAccountSuggestions] = useState<string[]>([]);
  const [invoicesList, setInvoicesList] = useState<Array<{ invoice_number: string; customer_name: string; total_amount: number; due_amount: number }>>([]);
  const [suggestionFor, setSuggestionFor] = useState<number | null>(null);

  const fetchVouchers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: filterType,
        status: filterStatus,
        search,
        page: String(page),
        limit: "20",
      });
      const res = await fetch(`/api/vouchers?${params}`);
      const data = await res.json();
      setVouchers(data.vouchers || []);
      setTotal(data.total || 0);
    } catch {
      toast.add({ title: "Failed to load vouchers", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus, search, page]);

  useEffect(() => {
    fetchVouchers();
  }, [fetchVouchers]);

  // Fetch account code suggestions from customers + suppliers + invoices
  useEffect(() => {
    async function fetchSuggestions() {
      try {
        const [cr, sr, ir] = await Promise.all([
          fetch("/api/customers?limit=200").then((r) => r.json()),
          fetch("/api/suppliers?limit=200").then((r) => r.json()),
          fetch("/api/invoices?limit=200").then((r) => r.json()),
        ]);
        const names: string[] = [
          ...(cr.customers || []).map((c: { name: string }) => c.name),
          ...(sr.suppliers || []).map((s: { name: string }) => s.name),
        ];
        setAccountSuggestions([...new Set(names)] as string[]);

        const invs = (ir.invoices || []).map((inv: { invoice_number: string; customer_id?: { name?: string } | string; total_amount?: number; due_amount?: number }) => ({
          invoice_number: inv.invoice_number,
          customer_name: typeof inv.customer_id === "object" ? inv.customer_id?.name || "" : String(inv.customer_id || ""),
          total_amount: inv.total_amount || 0,
          due_amount: inv.due_amount !== undefined ? inv.due_amount : inv.total_amount || 0,
        }));
        setInvoicesList(invs);
      } catch {
        // ignore
      }
    }
    fetchSuggestions();
  }, []);

  function calcTotals(entries: VoucherEntry[]) {
    const totalDebit = entries.reduce((s, e) => s + (Number(e.debit) || 0), 0);
    const totalCredit = entries.reduce((s, e) => s + (Number(e.credit) || 0), 0);
    return { totalDebit, totalCredit };
  }

  function updateEntry(idx: number, field: keyof VoucherEntry, value: string | number) {
    setForm((prev) => {
      const entries = prev.entries.map((e, i) => {
        if (i !== idx) return e;
        const updated = { ...e, [field]: value };
        // Auto-populate when Invoice # is typed in ref_no
        if (field === "ref_no" && typeof value === "string" && value.trim()) {
          const query = value.trim().toLowerCase();
          const matchedInv = invoicesList.find(
            (inv) => inv.invoice_number.toLowerCase() === query || inv.invoice_number.toLowerCase().includes(query)
          );
          if (matchedInv) {
            if (!updated.account_code) updated.account_code = matchedInv.customer_name;
            if (!updated.description) updated.description = `Invoice ${matchedInv.invoice_number} - ${matchedInv.customer_name}`;
            const amount = matchedInv.due_amount || matchedInv.total_amount || 0;
            if (prev.voucher_type === "RV") {
              updated.credit = amount;
              updated.debit = 0;
            } else if (prev.voucher_type === "PV") {
              updated.debit = amount;
              updated.credit = 0;
            }
          }
        }
        return updated;
      });
      return { ...prev, entries };
    });
  }

  function addEntry() {
    setForm((prev) => ({
      ...prev,
      entries: [...prev.entries, blankEntry()],
    }));
  }

  function removeEntry(idx: number) {
    setForm((prev) => {
      if (prev.entries.length <= 1) return prev;
      return { ...prev, entries: prev.entries.filter((_, i) => i !== idx) };
    });
  }

  function calculateNet() {
    setForm((prev) => {
      const { totalDebit, totalCredit } = calcTotals(prev.entries);
      const diff = totalDebit - totalCredit;
      if (Math.abs(diff) <= 0.01) {
        toast.add({ title: "Already balanced", type: "info" });
        return prev;
      }
      const lastIdx = prev.entries.length - 1;
      const entries = prev.entries.map((e, i) => {
        if (i !== lastIdx) return e;
        if (diff > 0) return { ...e, credit: (Number(e.credit) || 0) + diff };
        return { ...e, debit: (Number(e.debit) || 0) + Math.abs(diff) };
      });
      return { ...prev, entries };
    });
  }

  // Update amount in words whenever totals change
  useEffect(() => {
    const { totalDebit, totalCredit } = calcTotals(form.entries);
    const amt = Math.max(totalDebit, totalCredit);
    if (amt > 0) {
      const words = numberToWords(amt);
      setForm((prev) => ({ ...prev, amount_in_words: words }));
    }
  }, [form.entries]);

  // Open Create
  function openCreate(type: VoucherType = "RV") {
    setShowEdit(null);
    setCreateType(type);
    setForm(blankForm(type));
    setShowCreate(true);
  }

  // Open Edit
  function openEdit(v: Voucher) {
    setShowCreate(false);
    setShowEdit(v);
    setForm({
      voucher_type: v.voucher_type,
      voucher_date: v.voucher_date ? v.voucher_date.split("T")[0] : todayStr(),
      name_on_voucher: v.name_on_voucher || "",
      manual_receipt_no: v.manual_receipt_no || "",
      cost_center: v.cost_center || "",
      cheque_no: v.cheque_no || "",
      cheque_status: v.cheque_status || "",
      debit_account: v.debit_account || "",
      entries: v.entries?.length ? v.entries : [blankEntry()],
      amount_in_words: v.amount_in_words || "",
      remarks: v.remarks || "",
      print_format: v.print_format || "In House",
    });
  }

  // Save (Create)
  async function handleCreate() {
    if (!form.name_on_voucher.trim()) {
      toast.add({ title: "Name on Voucher is required", type: "error" });
      return;
    }
    const { totalDebit, totalCredit } = calcTotals(form.entries);

    setSaving(true);
    try {
      const res = await fetch("/api/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          total_debit: totalDebit,
          total_credit: totalCredit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.add({
        title: `Voucher ${data.voucher.voucher_number} created (Draft)`,
        type: "success",
      });
      setShowCreate(false);
      fetchVouchers();
    } catch (e) {
      toast.add({ title: String(e), type: "error" });
    } finally {
      setSaving(false);
    }
  }

  // Save (Update)
  async function handleUpdate() {
    if (!showEdit) return;
    if (!form.name_on_voucher.trim()) {
      toast.add({ title: "Name on Voucher is required", type: "error" });
      return;
    }
    const { totalDebit, totalCredit } = calcTotals(form.entries);

    setSaving(true);
    try {
      const res = await fetch(`/api/vouchers/${showEdit._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          total_debit: totalDebit,
          total_credit: totalCredit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.add({
        title: `Voucher ${data.voucher.voucher_number} updated`,
        type: "success",
      });
      setShowEdit(null);
      fetchVouchers();
    } catch (e) {
      toast.add({ title: String(e), type: "error" });
    } finally {
      setSaving(false);
    }
  }

  // Post voucher
  async function handlePost(id: string, voucherNo: string) {
    const { totalDebit, totalCredit } = calcTotals(form.entries);

    if (Math.abs(totalDebit - totalCredit) > 0.01 || totalDebit === 0) {
      toast.add({
        title: "Voucher must be balanced before posting",
        type: "error",
      });
      return;
    }

    setPosting(true);
    try {
      const res = await fetch(`/api/vouchers/${id}/post`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.add({ title: `Voucher ${voucherNo} posted successfully`, type: "success" });
      setShowEdit(null);
      fetchVouchers();
    } catch (e) {
      toast.add({ title: String(e), type: "error" });
    } finally {
      setPosting(false);
    }
  }

  // Delete voucher
  async function handleDelete(id: string, voucherNo: string) {
    if (!confirm(`Delete voucher ${voucherNo}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/vouchers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.add({ title: `Voucher ${voucherNo} deleted`, type: "success" });
      fetchVouchers();
    } catch (e) {
      toast.add({ title: String(e), type: "error" });
    }
  }

  // Voucher form (shared for create + edit)
  function renderVoucherForm(isEdit = false, editVoucher?: Voucher) {
    const { totalDebit, totalCredit } = calcTotals(form.entries);
    const isPosted = editVoucher?.status === "Posted";
    const isBalanced = Math.abs(totalDebit - totalCredit) <= 0.01 && totalDebit > 0;

    return (
      <div className="space-y-4">
        {/* Datalists for Autocomplete */}
        <datalist id="account-suggestions">
          {accountSuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <datalist id="invoice-suggestions">
          {invoicesList.map((inv) => (
            <option key={inv.invoice_number} value={inv.invoice_number}>
              {`${inv.invoice_number} - ${inv.customer_name} (Due: PKR ${inv.due_amount.toLocaleString()})`}
            </option>
          ))}
        </datalist>

        {/* Row 1: Type (Locked if edit), Date, Name on Voucher, Manual Receipt No */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs font-medium text-gray-500">Voucher Type <span className="text-red-500">*</span></Label>
              <Badge variant="outline" className="text-[10px] py-0">Locked</Badge>
            </div>
            <Select
              value={form.voucher_type}
              disabled={true}
            >
              <SelectTrigger className="h-9 text-sm bg-gray-100/80 dark:bg-gray-800/80 cursor-not-allowed">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOUCHER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Voucher Date <span className="text-red-500">*</span></Label>
            <Input
              type="date"
              className="h-9 text-sm"
              value={form.voucher_date}
              onChange={(e) => setForm((p) => ({ ...p, voucher_date: e.target.value }))}
              disabled={isPosted}
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Name on Voucher <span className="text-red-500">*</span></Label>
            <Input
              className="h-9 text-sm"
              placeholder="Payee / Payer name"
              value={form.name_on_voucher}
              onChange={(e) => setForm((p) => ({ ...p, name_on_voucher: e.target.value }))}
              disabled={isPosted}
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Manual Receipt No</Label>
            <Input
              className="h-9 text-sm"
              placeholder="e.g. R-1234"
              value={form.manual_receipt_no}
              onChange={(e) => setForm((p) => ({ ...p, manual_receipt_no: e.target.value }))}
              disabled={isPosted}
            />
          </div>
        </div>

        {/* Row 2: Bank / Source, Debit Account, Debit Amount, Cheque No */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Bank / Source <span className="text-red-500">*</span></Label>
            <Select
              onValueChange={(v) => {
                const b = BANK_ACCOUNTS.find((item) => item.name === v);
                if (b) setForm((p) => ({ ...p, debit_account: b.account }));
              }}
              disabled={isPosted}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select Bank / Cash" />
              </SelectTrigger>
              <SelectContent>
                {BANK_ACCOUNTS.map((b) => (
                  <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Debit Account <span className="text-red-500">*</span></Label>
            <Input
              className="h-9 text-sm font-medium text-primary"
              placeholder="Associated account"
              value={form.debit_account}
              onChange={(e) => setForm((p) => ({ ...p, debit_account: e.target.value }))}
              disabled={isPosted}
              list="account-suggestions"
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Debit Amount <span className="text-red-500">*</span></Label>
            <Input
              type="number"
              className="h-9 text-sm font-mono font-bold"
              placeholder="0.00"
              value={form.entries[0]?.debit || (totalDebit > 0 ? totalDebit : "")}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                updateEntry(0, "debit", val);
              }}
              disabled={isPosted}
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Cheque No</Label>
            <Input
              className="h-9 text-sm"
              placeholder="Cheque number"
              value={form.cheque_no}
              onChange={(e) => setForm((p) => ({ ...p, cheque_no: e.target.value }))}
              disabled={isPosted}
            />
          </div>
        </div>

        {/* Journal Entries Grid */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Journal Entries (Auto-fill on Invoice #)
            </Label>
            {!isPosted && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={calculateNet}
                >
                  <RefreshCw className="h-3 w-3" />
                  Calculate Net
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={addEntry}
                >
                  <Plus className="h-3 w-3" />
                  Add Row
                </Button>
              </div>
            )}
          </div>

          {/* Table header */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid text-[11px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-50 dark:bg-[#111113] px-2 py-1.5"
                style={{ gridTemplateColumns: "48px 80px 110px 100px 1fr 160px 96px 96px 36px" }}>
                <span>Br</span>
                <span>Ref Code</span>
                <span>Ref / Inv #</span>
                <span>Adj Date</span>
                <span>Description</span>
                <span>Account Code</span>
                <span className="text-right">Debit</span>
                <span className="text-right">Credit</span>
                <span></span>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
                {form.entries.map((entry, idx) => (
                  <div
                    key={idx}
                    className="grid items-center gap-1 px-2 py-1 hover:bg-gray-50/50 dark:hover:bg-[#111113]/50"
                    style={{ gridTemplateColumns: "48px 80px 110px 100px 1fr 160px 96px 96px 36px" }}
                  >
                    <Input
                      className="h-7 text-xs font-mono px-1.5"
                      value={entry.branch}
                      onChange={(e) => updateEntry(idx, "branch", e.target.value)}
                      disabled={isPosted}
                    />
                    <Input
                      className="h-7 text-xs font-mono px-1.5"
                      placeholder="Ref code"
                      value={entry.ref_code}
                      onChange={(e) => updateEntry(idx, "ref_code", e.target.value)}
                      disabled={isPosted}
                    />
                    <Input
                      className="h-7 text-xs font-mono px-1.5"
                      placeholder="Inv / Ref #"
                      value={entry.ref_no}
                      onChange={(e) => updateEntry(idx, "ref_no", e.target.value)}
                      disabled={isPosted}
                      list="invoice-suggestions"
                    />
                    <Input
                      type="date"
                      className="h-7 text-xs px-1"
                      value={entry.adj_date}
                      onChange={(e) => updateEntry(idx, "adj_date", e.target.value)}
                      disabled={isPosted}
                    />
                    <Input
                      className="h-7 text-xs"
                      placeholder="Description"
                      value={entry.description}
                      onChange={(e) => updateEntry(idx, "description", e.target.value)}
                      disabled={isPosted}
                    />
                    <div className="relative">
                      <Input
                        className="h-7 text-xs font-mono px-1.5"
                        placeholder="Type account name..."
                        value={entry.account_code}
                        onChange={(e) => updateEntry(idx, "account_code", e.target.value)}
                        disabled={isPosted}
                        list="account-suggestions"
                      />
                    </div>
                    <Input
                      type="number"
                      className="h-7 text-xs font-mono text-right px-1"
                      placeholder="0.00"
                      value={entry.debit || ""}
                      onChange={(e) => updateEntry(idx, "debit", parseFloat(e.target.value) || 0)}
                      disabled={isPosted}
                    />
                    <Input
                      type="number"
                      className="h-7 text-xs font-mono text-right px-1"
                      placeholder="0.00"
                      value={entry.credit || ""}
                      onChange={(e) => updateEntry(idx, "credit", parseFloat(e.target.value) || 0)}
                      disabled={isPosted}
                    />
                    <div className="flex justify-center">
                      {!isPosted && form.entries.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                          onClick={() => removeEntry(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Grid Footer: Totals */}
              <div className="grid items-center gap-1 px-2 py-2 bg-gray-50/80 dark:bg-[#111113] border-t border-gray-200 dark:border-gray-800 text-xs font-semibold"
                style={{ gridTemplateColumns: "48px 80px 110px 100px 1fr 160px 96px 96px 36px" }}>
                <span className="col-span-6 text-right font-bold text-gray-700 dark:text-gray-300 pr-2">Total:</span>
                <span className="text-right font-mono font-bold text-green-700 dark:text-green-400">
                  {totalDebit.toLocaleString("en-PK", { minimumFractionDigits: 2 })}
                </span>
                <span className="text-right font-mono font-bold text-blue-700 dark:text-blue-400">
                  {totalCredit.toLocaleString("en-PK", { minimumFractionDigits: 2 })}
                </span>
                <span></span>
              </div>
            </div>
          </div>
        </div>

        {/* Balance Status Banner */}
        <div className={`p-2.5 rounded-lg flex items-center justify-between text-xs border ${
          isBalanced
            ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/20 dark:border-green-800 dark:text-green-300"
            : "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-300"
        }`}>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isBalanced ? "bg-green-500" : "bg-amber-500"}`} />
            <span className="font-semibold">
              {isBalanced
                ? "Balanced Voucher (Debit = Credit)"
                : `Out of balance by PKR ${Math.abs(totalDebit - totalCredit).toLocaleString("en-PK", { minimumFractionDigits: 2 })}`}
            </span>
          </div>
          <span className="font-mono font-semibold">
            Diff: PKR {Math.abs(totalDebit - totalCredit).toLocaleString("en-PK", { minimumFractionDigits: 2 })}
          </span>
        </div>

        {/* Row 3: Cheque Status, Cost Center, Amount in Words */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Cheque Status</Label>
            <Select
              value={form.cheque_status}
              onValueChange={(v) => setForm((p) => ({ ...p, cheque_status: v ?? "" }))}
              disabled={isPosted}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select cheque status" />
              </SelectTrigger>
              <SelectContent>
                {CHEQUE_STATUSES.map((s) => (
                  <SelectItem key={s || "none"} value={s || "none"}>{s || "None"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Cost Center</Label>
            <Input
              className="h-9 text-sm"
              placeholder="e.g. Travel Operations"
              value={form.cost_center}
              onChange={(e) => setForm((p) => ({ ...p, cost_center: e.target.value }))}
              disabled={isPosted}
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Amount in Words</Label>
            <Input
              className="h-9 text-sm bg-gray-50 dark:bg-gray-800/50 font-medium"
              value={form.amount_in_words}
              readOnly
            />
          </div>
        </div>

        {/* Remarks & Print Format */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-3">
            <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Remarks / Narration</Label>
            <Textarea
              className="h-16 text-sm resize-none"
              placeholder="Enter detailed narration for accounting record..."
              value={form.remarks}
              onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))}
              disabled={isPosted}
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Print Format</Label>
            <Select
              value={form.print_format}
              onValueChange={(v) => setForm((p) => ({ ...p, print_format: v ?? "In House" }))}
              disabled={isPosted}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRINT_FORMATS.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const totalPages = Math.ceil(total / 20);
  const isFormView = showCreate || !!showEdit;

  return (
    <div className="space-y-6">
      {isFormView ? (
        /* Inline Create / Edit Voucher View */
        <div className="space-y-4">
          {/* Top Action & Navigation Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white dark:bg-[#111113] border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowCreate(false); setShowEdit(null); }}
                className="h-8 gap-1.5 text-xs font-semibold cursor-pointer border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Vouchers
              </Button>
              <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 hidden sm:block" />
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                {showEdit ? (
                  <>
                    <FileText className="h-4 w-4 text-primary" />
                    Editing Voucher #{showEdit.voucher_number}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[showEdit.status]}`}>
                      {showEdit.status}
                    </span>
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 text-primary" />
                    New {VOUCHER_TYPES.find((t) => t.value === createType)?.label.split(" - ")[1]}
                  </>
                )}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!showEdit && (
                <div className="flex items-center gap-1 mr-2">
                  {VOUCHER_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => { setCreateType(t.value); setForm(blankForm(t.value)); }}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                        createType === t.value ? t.color + " ring-2 ring-primary/30" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {t.value}
                    </button>
                  ))}
                </div>
              )}

              {showEdit && showEdit.status !== "Posted" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5 text-green-600 border-green-200 hover:bg-green-50 dark:border-green-800"
                  onClick={() => handlePost(showEdit._id, showEdit.voucher_number)}
                  disabled={posting || saving}
                >
                  {posting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FileCheck className="h-3.5 w-3.5" />}
                  Post Voucher
                </Button>
              )}

              {showEdit && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => window.open(`/dashboard/vouchers/${showEdit._id}/print`, "_blank")}
                >
                  <Printer className="h-3.5 w-3.5 text-purple-600" /> Print
                </Button>
              )}

              <Button
                type="button"
                size="sm"
                className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                onClick={showEdit ? handleUpdate : handleCreate}
                disabled={saving || (showEdit?.status === "Posted")}
              >
                {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {saving ? "Saving..." : showEdit ? "Save Changes" : "Save Voucher"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setShowCreate(false); setShowEdit(null); }}
                className="h-8 w-8 p-0 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Form Card */}
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113] shadow-md">
            <CardContent className="p-5">
              {renderVoucherForm(!!showEdit, showEdit || undefined)}
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Vouchers Main List View */
        <div className="space-y-6">
          {/* Page header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
                Vouchers
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Receipt, Payment, Journal, Debit Note &amp; Cash Deposit vouchers
              </p>
            </div>

            {/* Quick Create Voucher Type Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {VOUCHER_TYPES.map((t) => (
                <Button
                  key={t.value}
                  size="sm"
                  variant="outline"
                  className={`h-9 text-xs gap-1 font-bold border ${t.color}`}
                  onClick={() => openCreate(t.value)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t.value}
                </Button>
              ))}
            </div>
          </div>

          {/* Filters bar */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                className="pl-9 h-9 text-sm"
                placeholder="Search vouchers..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <Select value={filterType} onValueChange={(v) => { setFilterType(v ?? "all"); setPage(1); }}>
              <SelectTrigger className="h-9 w-44 text-sm">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {VOUCHER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.value} — {t.label.split(" - ")[1]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v ?? "all"); setPage(1); }}>
              <SelectTrigger className="h-9 w-36 text-sm">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
                <SelectItem value="Posted">Posted</SelectItem>
                <SelectItem value="Voided">Voided</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={fetchVouchers}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {/* Vouchers table */}
          <div className="bg-white dark:bg-[#111113] rounded-xl border border-gray-200 dark:border-[#1e1e21] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-[#1e1e21] bg-gray-50 dark:bg-[#0d0d0f]">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Voucher #</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Debit</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Credit</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-[#1a1a1d]">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="text-center py-16 text-gray-400">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                        Loading vouchers...
                      </td>
                    </tr>
                  ) : vouchers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-16 text-gray-400">
                        <div className="text-4xl mb-3">🧾</div>
                        <p className="text-sm font-medium text-gray-500">No vouchers found</p>
                        <p className="text-xs text-gray-400 mt-1">Create your first voucher by clicking a Voucher Type above</p>
                      </td>
                    </tr>
                  ) : (
                    vouchers.map((v) => {
                      const typeInfo = VOUCHER_TYPES.find((t) => t.value === v.voucher_type);
                      return (
                        <tr
                          key={v._id}
                          className="hover:bg-gray-50/60 dark:hover:bg-[#111113]/60 cursor-pointer transition-colors"
                          onClick={() => openEdit(v)}
                        >
                          <td className="px-4 py-3 font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {v.voucher_number}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${typeInfo?.color}`}>
                              {v.voucher_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {v.voucher_date ? new Date(v.voucher_date).toLocaleDateString("en-GB") : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-[180px] truncate">
                            {v.name_on_voucher || "—"}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-mono text-green-700 dark:text-green-400">
                            {v.total_debit ? v.total_debit.toLocaleString("en-PK") : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-mono text-blue-700 dark:text-blue-400">
                            {v.total_credit ? v.total_credit.toLocaleString("en-PK") : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${STATUS_COLORS[v.status]}`}>
                              {v.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              {v.status !== "Posted" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs gap-1 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20"
                                  onClick={() => handlePost(v._id, v.voucher_number)}
                                  disabled={posting}
                                >
                                  <FileCheck className="h-3.5 w-3.5" />
                                  Post
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs gap-1"
                                onClick={() => window.open(`/dashboard/vouchers/${v._id}/print`, "_blank")}
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </Button>
                              {v.status !== "Posted" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                                  onClick={() => handleDelete(v._id, v.voucher_number)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-[#1e1e21]">
                <p className="text-xs text-gray-500">
                  Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                    Prev
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
