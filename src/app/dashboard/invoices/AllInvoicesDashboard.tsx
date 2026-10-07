"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TrendingUp, Wallet, Scale, FileText, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, RotateCcw,
} from "lucide-react";
import { formatDateDDMMYYYY } from "@/lib/date-utils";
import { apiFetch, notify } from "@/lib/notify";

export interface AllInvoiceRow {
  _id: string;
  invoice_number: string;
  invoice_type?: string;
  customer_id: { _id: string; name: string } | string;
  customer_name?: string;
  print_name?: string;
  status: string;
  total_amount: number;
  internal_remarks?: string;
  currency: string;
  bsp_flag: boolean;
  created_at: string;
}

interface Summary {
  invoice_count: number;
  status_counts: { Posted: number; Draft: number; Voided: number };
  total_business: number;
  by_type: { type: string; count: number; amount: number }[];
  payments_due: number;
  payments_received: number;
  paid_count: number;
  partial_count: number;
  unpaid_count: number;
  profit_loss: number;
  supplier_cost: number;
}

// Invoice types in sidebar order; "Other" is shown as "Others" like the sidebar
const INVOICE_TYPES = ["Ticket", "Hotel", "Transport", "Umrah", "Hajj", "Visa", "Other"];
const TYPE_LABELS: Record<string, string> = {
  Ticket: "Ticket", Hotel: "Hotel", Transport: "Transport", Umrah: "Umrah", Hajj: "Hajj", Visa: "Visa", Package: "Package", Other: "Others",
};

const statusStyles: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400",
  Posted: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  Voided: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

const typeStyles: Record<string, string> = {
  Ticket: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-800/60",
  Hotel: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-800/60",
  Umrah: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-800/60",
  Hajj: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-400 dark:border-teal-800/60",
  Visa: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-800/60",
  Transport: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-800/60",
  Other: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-700",
};

const fmt = (n: number) => n.toLocaleString("en-PK", { maximumFractionDigits: 0 });

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const DASH = "—";

function StatCard({ label, icon: Icon, accent, children }: {
  label: string;
  icon: typeof TrendingUp;
  accent: string;
  children: ReactNode;
}) {
  return (
    <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</span>
          <span className={`h-8 w-8 rounded-lg flex items-center justify-center ${accent}`}>
            <Icon className="h-4 w-4" />
          </span>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function Headline({ value, sub, className = "text-gray-900 dark:text-gray-50", currency = true }: {
  value: string | number;
  sub: string;
  className?: string;
  currency?: boolean;
}) {
  return (
    <>
      <div className={`mt-3 text-2xl font-semibold font-mono tabular-nums ${className}`}>
        {currency && <span className="text-[13px] font-medium text-gray-400 mr-1">PKR</span>}
        {value}
      </div>
      <p className="mt-1 text-[11px] text-gray-400">{sub}</p>
    </>
  );
}

function Details({ children }: { children: ReactNode }) {
  return <div className="mt-3 pt-3 border-t border-gray-100 dark:border-[#1e1e21] space-y-1.5">{children}</div>;
}

function DetailRow({ label, value, valueClass = "text-gray-700 dark:text-gray-300" }: {
  label: string;
  value: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`font-mono font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}

/** Total Business Done / Payments Due / P&L / Invoices for whatever the grid is filtered to. */
function InvoiceSummaryCards({ summary: s, filtered }: { summary: Summary | null; filtered: boolean }) {
  const loading = "loading…";
  const pl = s?.profit_loss ?? 0;
  const plClass = pl < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400";
  const marginPct = s && s.total_business > 0 ? (pl / s.total_business) * 100 : 0;
  const collectedPct = s && s.total_business > 0 ? Math.min(100, (s.payments_received / s.total_business) * 100) : 0;
  const invoiceTotal = s ? s.status_counts.Posted + s.status_counts.Draft + s.status_counts.Voided : 0;

  return (
    <div className="space-y-3">
      <h2 className="text-[13px] font-semibold text-gray-700 dark:text-gray-300">
        Summary
        <span className="ml-2 text-[11px] font-normal text-gray-400">
          {filtered ? "Invoices matching the current filters" : "All invoices, all types"}
        </span>
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* 1. Total Business Done — posted sales, split by invoice type */}
        <StatCard label="Total Business Done" icon={TrendingUp} accent="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10">
          <Headline
            value={s ? fmt(s.total_business) : DASH}
            sub={s ? `${s.invoice_count} posted ${s.invoice_count === 1 ? "invoice" : "invoices"}` : loading}
          />
          <Details>
            {s && s.by_type.length === 0 && <p className="text-[12px] text-gray-400">No business recorded.</p>}
            {s?.by_type.slice(0, 4).map((t) => (
              <DetailRow key={t.type} label={`${TYPE_LABELS[t.type] || t.type} (${t.count})`} value={fmt(t.amount)} />
            ))}
          </Details>
        </StatCard>

        {/* 2. Payments Due — outstanding on posted invoices, with collection progress */}
        <StatCard label="Payments Due" icon={Wallet} accent="text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10">
          <Headline
            value={s ? fmt(s.payments_due) : DASH}
            sub={s ? `${Math.round(collectedPct)}% collected` : loading}
            className={s && s.payments_due > 0 ? "text-rose-600 dark:text-rose-400" : "text-gray-900 dark:text-gray-50"}
          />
          <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-[#1e1e21] overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${collectedPct}%` }} />
          </div>
          <Details>
            <DetailRow label="Received" value={s ? fmt(s.payments_received) : DASH} valueClass="text-emerald-600 dark:text-emerald-400" />
            <DetailRow label="Unpaid invoices" value={s?.unpaid_count ?? DASH} />
            <DetailRow label="Partially paid" value={s?.partial_count ?? DASH} />
            <DetailRow label="Fully paid" value={s?.paid_count ?? DASH} />
          </Details>
        </StatCard>

        {/* 3. P&L — agency margin on posted invoices */}
        <StatCard label="P&L" icon={Scale} accent="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10">
          <Headline
            value={s ? `${pl < 0 ? "−" : ""}${fmt(Math.abs(pl))}` : DASH}
            sub={s ? (pl < 0 ? "Loss" : "Profit") : loading}
            className={plClass}
          />
          <Details>
            <DetailRow label="Sales" value={s ? fmt(s.total_business) : DASH} />
            <DetailRow label="Supplier cost" value={s ? fmt(s.supplier_cost) : DASH} />
            <DetailRow label="Margin" value={s ? `${marginPct.toFixed(1)}%` : DASH} valueClass={plClass} />
          </Details>
        </StatCard>

        {/* 4. Invoices — every matching invoice, by status */}
        <StatCard label="Invoices" icon={FileText} accent="text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10">
          <Headline value={s ? invoiceTotal : DASH} sub={s ? "matching invoices" : loading} currency={false} />
          <Details>
            <DetailRow label="Posted" value={s?.status_counts.Posted ?? DASH} valueClass="text-emerald-600 dark:text-emerald-400" />
            <DetailRow label="Draft" value={s?.status_counts.Draft ?? DASH} />
            <DetailRow label="Voided" value={s?.status_counts.Voided ?? DASH} valueClass="text-red-500" />
          </Details>
        </StatCard>
      </div>
    </div>
  );
}

interface GridFilters {
  invoice_number: string;
  date_from: string;
  date_to: string;
  type: string;
  customer: string;
  amount_min: string;
  amount_max: string;
  status: string;
  remarks: string;
}

const EMPTY_FILTERS: GridFilters = {
  invoice_number: "", date_from: "", date_to: "", type: "", customer: "",
  amount_min: "", amount_max: "", status: "", remarks: "",
};

type SortKey = "invoice_number" | "invoice_date" | "invoice_type" | "customer_name" | "amount" | "status" | "internal_remarks";

const PAGE_SIZE = 50;

const QUICK_RANGES = [
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "6m", label: "Last 6 Months" },
  { key: "ytd", label: "Year to Date" },
] as const;
type QuickRange = (typeof QUICK_RANGES)[number]["key"];

function quickRangeDates(key: QuickRange) {
  const today = new Date();
  const from = new Date(today);
  if (key === "7d") from.setDate(today.getDate() - 6);
  else if (key === "30d") from.setDate(today.getDate() - 29);
  else if (key === "6m") from.setMonth(today.getMonth() - 6);
  else { from.setMonth(0); from.setDate(1); }
  return { date_from: toISO(from), date_to: toISO(today) };
}

// Text filters are debounced so typing doesn't fire a request per keystroke
function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const headClass = "text-[11px] font-semibold uppercase tracking-wider text-gray-400";
const filterInput = "h-7 text-[11px] px-2 bg-slate-50/50 dark:bg-[#161619] border-slate-200 dark:border-slate-800";

function SortHead({ by, label, sort, onSort, className = "" }: {
  by: SortKey;
  label: string;
  sort: { by: SortKey; dir: "asc" | "desc" };
  onSort: (by: SortKey) => void;
  className?: string;
}) {
  const active = sort.by === by;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={`${headClass} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(by)}
        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200 transition-colors ${active ? "text-gray-700 dark:text-gray-200" : ""}`}
        title={`Sort by ${label}`}
      >
        {label}
        <Icon className={`h-3 w-3 ${active ? "" : "opacity-50"}`} />
      </button>
    </TableHead>
  );
}

/**
 * All Invoices home: summary cards over a Shopify-style grid — 50 invoices per page,
 * every column sortable and filterable, quick date presets. Double-click a row to open it.
 */
export function AllInvoicesView({ refreshKey, onOpen }: {
  refreshKey: unknown;
  onOpen: (inv: AllInvoiceRow) => void;
}) {
  const [filters, setFilters] = useState<GridFilters>(EMPTY_FILTERS);
  const [quickRange, setQuickRange] = useState<QuickRange | null>(null);
  const [sort, setSort] = useState<{ by: SortKey; dir: "asc" | "desc" }>({ by: "invoice_date", dir: "desc" });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AllInvoiceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const debounced = useDebounced(filters, 300);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(debounced)) if (v.trim()) params.set(k, v.trim());
  params.set("sort_by", sort.by);
  params.set("sort_dir", sort.dir);
  const query = params.toString();

  // Any filter or sort change goes back to the first page
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setPage(1);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<{ invoices?: typeof rows; total?: number; pages?: number; summary?: typeof summary }>(`/api/invoices/grid?${query}&page=${page}&limit=${PAGE_SIZE}`)
      .then((d) => {
        if (cancelled) return;
        setRows(d.invoices || []);
        setTotal(d.total || 0);
        setPages(d.pages || 1);
        setSummary(d.summary || null);
      })
      .catch((e) => { if (!cancelled) notify.error("Failed to load invoices", e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query, page, refreshKey]);

  const setFilter = (key: keyof GridFilters, value: string) => {
    if (key === "date_from" || key === "date_to") setQuickRange(null);
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const applyQuickRange = (key: QuickRange) => {
    if (quickRange === key) {
      setQuickRange(null);
      setFilters((f) => ({ ...f, date_from: "", date_to: "" }));
      return;
    }
    setQuickRange(key);
    setFilters((f) => ({ ...f, ...quickRangeDates(key) }));
  };

  const toggleSort = (by: SortKey) => {
    setSort((s) => (s.by === by
      ? { by, dir: s.dir === "asc" ? "desc" : "asc" }
      : { by, dir: by === "invoice_date" || by === "amount" ? "desc" : "asc" }));
  };

  const hasFilters = Object.values(filters).some((v) => v.trim());
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setQuickRange(null);
  };

  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-5">
      <InvoiceSummaryCards summary={summary} filtered={hasFilters} />

      <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
        <CardHeader className="px-6 pt-5 pb-3 flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-50 flex items-center gap-2">
            <span>All Invoices</span>
            <Badge variant="secondary" className="text-[11px] font-mono font-normal">
              {total} {total === 1 ? "invoice" : "invoices"}
            </Badge>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            {QUICK_RANGES.map((r) => (
              <Button
                key={r.key}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyQuickRange(r.key)}
                className={`h-7 px-2.5 text-[11px] ${quickRange === r.key ? "bg-[#1a1a1d] text-white border-[#1a1a1d] hover:bg-[#1a1a1d] hover:text-white dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-100 dark:hover:text-gray-900" : ""}`}
              >
                {r.label}
              </Button>
            ))}
            {hasFilters && (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-2 text-[11px] text-slate-500 gap-1">
                <RotateCcw className="h-3 w-3" /> Clear filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-5">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-100 dark:border-[#1e1e21]">
                  <SortHead by="invoice_number" label="Invoice Number" sort={sort} onSort={toggleSort} />
                  <SortHead by="invoice_date" label="Invoice Date" sort={sort} onSort={toggleSort} />
                  <SortHead by="invoice_type" label="Invoice Type" sort={sort} onSort={toggleSort} />
                  <SortHead by="customer_name" label="Customer Name" sort={sort} onSort={toggleSort} />
                  <SortHead by="amount" label="Invoice Amount" sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHead by="status" label="Invoice Status" sort={sort} onSort={toggleSort} />
                  <SortHead by="internal_remarks" label="Internal Remarks" sort={sort} onSort={toggleSort} />
                </TableRow>
                {/* Per-column filters */}
                <TableRow className="border-gray-100 dark:border-[#1e1e21] hover:bg-transparent">
                  <TableHead className="py-2 align-top min-w-[120px]">
                    <Input value={filters.invoice_number} onChange={(e) => setFilter("invoice_number", e.target.value)} placeholder="Search #" className={filterInput} />
                  </TableHead>
                  <TableHead className="py-2 align-top min-w-[140px]">
                    <div className="flex flex-col gap-1">
                      <DatePicker value={filters.date_from} onChange={(v) => setFilter("date_from", v || "")} placeholder="From" className={filterInput} />
                      <DatePicker value={filters.date_to} onChange={(v) => setFilter("date_to", v || "")} placeholder="To" className={filterInput} />
                    </div>
                  </TableHead>
                  <TableHead className="py-2 align-top min-w-[110px]">
                    <Select value={filters.type || "all"} onValueChange={(v) => setFilter("type", !v || v === "all" ? "" : v)}>
                      <SelectTrigger size="sm" className={`w-full ${filterInput}`}>
                        <SelectValue>{(val) => (val === "all" ? "All Types" : TYPE_LABELS[val] || val)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        {INVOICE_TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableHead>
                  <TableHead className="py-2 align-top min-w-[150px]">
                    <Input value={filters.customer} onChange={(e) => setFilter("customer", e.target.value)} placeholder="Search customer" className={filterInput} />
                  </TableHead>
                  <TableHead className="py-2 align-top min-w-[110px]">
                    <div className="flex flex-col gap-1">
                      <Input type="number" value={filters.amount_min} onChange={(e) => setFilter("amount_min", e.target.value)} placeholder="Min" className={`${filterInput} text-right`} />
                      <Input type="number" value={filters.amount_max} onChange={(e) => setFilter("amount_max", e.target.value)} placeholder="Max" className={`${filterInput} text-right`} />
                    </div>
                  </TableHead>
                  <TableHead className="py-2 align-top min-w-[110px]">
                    <Select value={filters.status || "all"} onValueChange={(v) => setFilter("status", !v || v === "all" ? "" : v)}>
                      <SelectTrigger size="sm" className={`w-full ${filterInput}`}>
                        <SelectValue>{(val) => (val === "all" ? "All Status" : val)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="Posted">Posted</SelectItem>
                        <SelectItem value="Draft">Draft</SelectItem>
                        <SelectItem value="Voided">Voided</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableHead>
                  <TableHead className="py-2 align-top min-w-[150px]">
                    <Input value={filters.remarks} onChange={(e) => setFilter("remarks", e.target.value)} placeholder="Search remarks" className={filterInput} />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-[13px] text-gray-400">
                      {hasFilters ? "No invoices match these filters." : "No invoices recorded yet."}
                    </TableCell>
                  </TableRow>
                ) : rows.map((inv) => {
                  const type = inv.invoice_type || "Ticket";
                  const customerName = inv.customer_name
                    || (inv.customer_id && typeof inv.customer_id === "object" ? inv.customer_id.name : inv.print_name)
                    || "-";
                  return (
                    <TableRow
                      key={inv._id}
                      onDoubleClick={() => onOpen(inv)}
                      className={`border-gray-100 dark:border-[#1e1e21] hover:bg-gray-100/80 dark:hover:bg-[#1a1a1d] cursor-pointer transition-colors select-none ${loading ? "opacity-60" : ""}`}
                      title="Double-click to open invoice"
                    >
                      <TableCell className="font-mono text-[13px] font-semibold text-gray-900 dark:text-gray-100">{inv.invoice_number}</TableCell>
                      <TableCell className="text-[12px] text-gray-500 font-mono">{formatDateDDMMYYYY(inv.created_at)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium ${typeStyles[type] || typeStyles.Other}`}>
                          {TYPE_LABELS[type] || type}
                        </span>
                      </TableCell>
                      <TableCell className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{customerName}</TableCell>
                      <TableCell className={`text-right font-mono text-[13px] ${inv.status === "Voided" ? "line-through text-gray-400" : "font-semibold text-gray-900 dark:text-gray-100"}`}>
                        {fmt(inv.total_amount || 0)}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${statusStyles[inv.status] || ""}`}>
                          {inv.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-[12px] text-gray-500 dark:text-gray-400 max-w-[260px] truncate" title={inv.internal_remarks || undefined}>
                        {inv.internal_remarks || ""}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 mt-2 border-t border-gray-100 dark:border-[#1e1e21]">
            <span className="text-[12px] text-gray-500">
              {total === 0 ? "No invoices" : `Showing ${firstRow}–${lastRow} of ${total}`}
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </Button>
              <span className="text-[12px] text-gray-500 font-mono">Page {page} of {pages}</span>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1" disabled={page >= pages || loading} onClick={() => setPage((p) => Math.min(pages, p + 1))}>
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

