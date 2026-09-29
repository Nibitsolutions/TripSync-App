"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { TrendingUp, Wallet, Scale, FileText } from "lucide-react";
import { formatDateDDMMYYYY } from "@/lib/date-utils";
import { SERVICE_LABELS } from "@/lib/serviceInvoice";

export interface AllInvoiceRow {
  _id: string;
  invoice_number: string;
  invoice_type?: string;
  customer_id: { _id: string; name: string } | string;
  print_name?: string;
  status: string;
  total_amount: number;
  credit_amount?: number;
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

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

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

/** One day's Total Business Done / Payments Due / P&L / Invoices across all invoice types. */
export function InvoiceSummaryCards({ refreshKey }: { refreshKey: unknown }) {
  const [date, setDate] = useState(todayISO());
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/invoices/summary?date=${date}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && !d.error) setSummary(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [refreshKey, date]);

  const isToday = date === todayISO();
  const s = summary;
  const loading = "loading…";
  const pl = s?.profit_loss ?? 0;
  const plClass = pl < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400";
  const marginPct = s && s.total_business > 0 ? (pl / s.total_business) * 100 : 0;
  const collectedPct = s && s.total_business > 0 ? Math.min(100, (s.payments_received / s.total_business) * 100) : 0;
  const invoiceTotal = s ? s.status_counts.Posted + s.status_counts.Draft + s.status_counts.Voided : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-gray-700 dark:text-gray-300">
          {isToday ? "Today's Summary" : `Summary for ${formatDateDDMMYYYY(date)}`}
          <span className="ml-2 text-[11px] font-normal text-gray-400">All invoice types combined</span>
        </h2>
        <div className="flex items-center gap-2">
          {!isToday && (
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDate(todayISO())}>Today</Button>
          )}
          <div className="w-36">
            <DatePicker value={date} onChange={(v) => setDate(v || todayISO())} className="h-8 text-xs bg-white dark:bg-[#111113]" />
          </div>
        </div>
      </div>

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
              <DetailRow key={t.type} label={`${SERVICE_LABELS[t.type] || t.type} (${t.count})`} value={fmt(t.amount)} />
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

        {/* 4. Invoices — everything created on the day, by status */}
        <StatCard label="Invoices" icon={FileText} accent="text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10">
          <Headline value={s ? invoiceTotal : DASH} sub={s ? "created on this day" : loading} currency={false} />
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

/** Every invoice across all types; double-click a row to open it. */
export function AllInvoicesTable({ invoices, onOpen, emptyText }: {
  invoices: AllInvoiceRow[];
  onOpen: (inv: AllInvoiceRow) => void;
  emptyText: string;
}) {
  const headClass = "text-[11px] font-semibold uppercase tracking-wider text-gray-400";
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-gray-100 dark:border-[#1e1e21]">
            <TableHead className={headClass}>Invoice Number</TableHead>
            <TableHead className={headClass}>Invoice Type</TableHead>
            <TableHead className={headClass}>Invoice Date</TableHead>
            <TableHead className={headClass}>Customer Name</TableHead>
            <TableHead className={`${headClass} text-right`}>Debit / Credit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-12 text-[13px] text-gray-400">{emptyText}</TableCell>
            </TableRow>
          ) : invoices.map((inv) => {
            const type = inv.invoice_type || "Ticket";
            const voided = inv.status === "Voided";
            const customerName = inv.customer_id && typeof inv.customer_id === "object" ? inv.customer_id.name : (inv.print_name || "-");
            return (
              <TableRow
                key={inv._id}
                onDoubleClick={() => onOpen(inv)}
                className="border-gray-100 dark:border-[#1e1e21] hover:bg-gray-100/80 dark:hover:bg-[#1a1a1d] cursor-pointer transition-colors select-none"
                title="Double-click to open invoice"
              >
                <TableCell className="font-mono text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                  {inv.invoice_number}
                  {inv.status !== "Posted" && (
                    <span className={`ml-2 text-[10px] font-sans font-semibold ${voided ? "text-red-500" : "text-gray-400"}`}>{inv.status}</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium ${typeStyles[type] || typeStyles.Other}`}>
                    {SERVICE_LABELS[type] || type}
                  </span>
                </TableCell>
                <TableCell className="text-[12px] text-gray-500 font-mono">{formatDateDDMMYYYY(inv.created_at)}</TableCell>
                <TableCell className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{customerName}</TableCell>
                <TableCell className="text-right font-mono text-[13px]">
                  <div className={voided ? "line-through text-gray-400" : "font-semibold text-gray-900 dark:text-gray-100"}>
                    {fmt(inv.total_amount || 0)} <span className="text-[10px] font-sans font-semibold text-blue-600 dark:text-blue-400">Dr</span>
                  </div>
                  {!!inv.credit_amount && inv.credit_amount > 0 && (
                    <div className="text-[12px] text-emerald-600 dark:text-emerald-400">
                      {fmt(inv.credit_amount)} <span className="text-[10px] font-sans font-semibold">Cr</span>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
