"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------
export class FetchError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function api<T = Record<string, unknown>>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new FetchError(res.status, data.code || "ERROR", data.message || data.error || `Request failed (${res.status})`);
  return data as T;
}

export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && v !== false) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function useApi<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const depsKey = JSON.stringify(deps);
  const reload = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      setData(await api<T>(url));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, depsKey]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

// ---------------------------------------------------------------------------
// Current platform user (permissions)
// ---------------------------------------------------------------------------
export interface Me {
  user: { id: string; name: string; email: string; role: "SuperAdmin" | "Manager" | "SalesExecutive"; role_label: string };
  permissions: string[];
  totp_enabled: boolean;
  requires_2fa_setup: boolean;
}

export const MeContext = createContext<Me | null>(null);
export function useMe() {
  return useContext(MeContext);
}
export function useCan() {
  const me = useMe();
  return (p: string) => Boolean(me?.permissions.includes(p));
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
export function pkr(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return `PKR ${Math.round(n).toLocaleString("en-PK")}`;
}

export function dmy(d: string | Date | null | undefined, withTime = false) {
  if (!d) return "-";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).formatToParts(date);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("day")}-${g("month")}-${g("year")}${withTime ? ` ${g("hour")}:${g("minute")}` : ""}`;
}

/** Value for <input type="datetime-local"> in PKT. */
export function toPktInput(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = new Date(new Date(d).getTime() + 5 * 3_600_000);
  return date.toISOString().slice(0, 16);
}
/** Parse a datetime-local value entered in PKT to ISO. */
export function fromPktInput(v: string) {
  return v ? new Date(`${v}:00+05:00`).toISOString() : null;
}

export function ago(d: string | Date | null | undefined) {
  if (!d) return "-";
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const label = (s: string | null | undefined) => (s ? s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : "-");

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------
const TONES: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  red: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400",
  slate: "bg-slate-200 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300",
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  ACTIVE: "green", TRIAL: "blue", EXPIRED: "amber", SUSPENDED: "red", OFFBOARDED: "slate", PENDING: "violet", REJECTED: "gray",
  COLD_STORAGE: "slate", PURGED: "gray", APPROVED: "green", REVERSED: "red", CANCELLED: "gray", SCHEDULED: "blue",
  DISABLED: "gray", OPEN: "red", IN_PROGRESS: "blue", WAITING_ON_CUSTOMER: "amber", RESOLVED: "green", CLOSED: "gray",
  DRAFT: "gray", SENDING: "blue", SENT: "green", FAILED: "red", QUEUED: "violet", SKIPPED: "gray", COMPLETED: "gray",
  ACCRUED: "amber", PAID: "green", VERIFIED: "green", RUNNING: "blue", DELETED: "gray", RETAINED: "green",
  URGENT: "red", HIGH: "amber", NORMAL: "blue", LOW: "gray", PROMOTIONAL: "violet", OPERATIONAL: "blue",
};

export function Badge({ children, tone }: { children: React.ReactNode; tone?: keyof typeof TONES }) {
  return <span className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-semibold ${TONES[tone ?? "gray"]}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-gray-400">-</span>;
  return <Badge tone={STATUS_TONE[status] ?? "gray"}>{label(status)}</Badge>;
}

// ---------------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------------
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">{title}</h1>
        {subtitle && <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, actions, children, className = "" }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl bg-white dark:bg-[#111113] border border-gray-200/80 dark:border-[#1e1e21] shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2">
          {title && <h2 className="text-[14px] font-semibold text-gray-900 dark:text-gray-50">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="px-5 pb-4 pt-1">{children}</div>
    </div>
  );
}

export function Stat({ title, value, hint, tone }: { title: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "red" | "green" | "amber" }) {
  const color = tone === "red" ? "text-red-600 dark:text-red-400" : tone === "green" ? "text-emerald-600 dark:text-emerald-400" : tone === "amber" ? "text-amber-600 dark:text-amber-400" : "text-gray-900 dark:text-gray-50";
  return (
    <div className="rounded-xl bg-white dark:bg-[#111113] border border-gray-200/80 dark:border-[#1e1e21] shadow-sm p-4">
      <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{title}</p>
      <p className={`text-2xl font-bold tracking-tight mt-1.5 ${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

export function Field({ label: l, children, hint, className = "" }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-[12px] font-medium">{l}</Label>
      {children}
      {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

export function NativeSelect({ value, onChange, options, className = "", placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string } | string>;
  className?: string;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-9 rounded-lg border border-input bg-transparent px-2.5 text-[13px] dark:bg-input/30 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${className}`}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: label(o) } : o;
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return <p className="text-[12px] text-gray-400 pt-3">{total} record{total === 1 ? "" : "s"}</p>;
  const nums: number[] = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) nums.push(i);
  return (
    <div className="flex items-center justify-between pt-3 gap-2 flex-wrap">
      <p className="text-[12px] text-gray-400">
        {(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total}
      </p>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        {nums.map((n) => (
          <Button key={n} size="sm" variant={n === page ? "default" : "outline"} className="h-7 min-w-7 px-2 text-[12px]" onClick={() => onPage(n)}>
            {n}
          </Button>
        ))}
        <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-[13px] text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30">{message}</div>;
}

export function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 px-3 py-2 whitespace-nowrap ${className}`}>{children}</th>;
}
export function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 text-[13px] text-gray-700 dark:text-gray-300 align-top ${className}`}>{children}</td>;
}
export function DataTable({ head, children, empty, colSpan }: { head: React.ReactNode; children: React.ReactNode; empty?: boolean; colSpan?: number }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full min-w-[640px]">
        <thead className="border-b border-gray-100 dark:border-[#1e1e21]">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-[#1e1e21]">
          {empty ? (
            <tr>
              <td colSpan={colSpan ?? 20} className="text-center py-10 text-[13px] text-gray-400">
                Nothing here yet.
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action dialog: generic form dialog that collects fields (reason etc.) and runs an async action.
// ---------------------------------------------------------------------------
export interface ActionField {
  name: string;
  label: string;
  type?: "text" | "textarea" | "number" | "select" | "date" | "datetime-local" | "checkbox";
  options?: Array<{ value: string; label: string } | string>;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  defaultValue?: string | boolean;
}

export interface ActionSpec {
  title: string;
  description?: React.ReactNode;
  fields?: ActionField[];
  confirmLabel?: string;
  danger?: boolean;
  run: (values: Record<string, string | boolean>) => Promise<unknown>;
  onDone?: (result: unknown) => void;
}

export function ActionDialog({ spec, onClose }: { spec: ActionSpec | null; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!spec) return;
    const init: Record<string, string | boolean> = {};
    for (const f of spec.fields ?? []) init[f.name] = f.defaultValue ?? (f.type === "checkbox" ? false : "");
    setValues(init);
    setError(null);
  }, [spec]);

  if (!spec) return null;
  const missing = (spec.fields ?? []).some((f) => f.required && !String(values[f.name] ?? "").trim());

  async function submit() {
    if (!spec) return;
    setBusy(true);
    setError(null);
    try {
      const result = await spec.run(values);
      spec.onDone?.(result);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!spec} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">{spec.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {spec.description && <div className="text-[13px] text-gray-600 dark:text-gray-300">{spec.description}</div>}
          {(spec.fields ?? []).map((f) => (
            <Field key={f.name} label={`${f.label}${f.required ? " *" : ""}`} hint={f.hint}>
              {f.type === "textarea" ? (
                <Textarea value={String(values[f.name] ?? "")} placeholder={f.placeholder} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} className="min-h-[70px]" />
              ) : f.type === "select" ? (
                <NativeSelect value={String(values[f.name] ?? "")} onChange={(val) => setValues((v) => ({ ...v, [f.name]: val }))} options={f.options ?? []} className="w-full" placeholder={f.required ? undefined : "—"} />
              ) : f.type === "checkbox" ? (
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={Boolean(values[f.name])} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.checked }))} />
                  {f.placeholder}
                </label>
              ) : (
                <Input type={f.type ?? "text"} value={String(values[f.name] ?? "")} placeholder={f.placeholder} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} />
              )}
            </Field>
          ))}
          <ErrorNote message={error} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || missing} className={spec.danger ? "bg-red-600 hover:bg-red-700 text-white" : ""}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {spec.confirmLabel ?? "Confirm"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Shows a one-off link (set-password) the admin can copy and share on WhatsApp. */
export function LinkNotice({ link, onClose, title = "Set-password link" }: { link: string | null; onClose: () => void; title?: string }) {
  const [copied, setCopied] = useState(false);
  if (!link) return null;
  return (
    <div className="mb-5 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/20">
      <p className="text-[13px] font-semibold text-emerald-800 dark:text-emerald-300">{title}</p>
      <p className="text-[12px] text-emerald-700 dark:text-emerald-400 mt-0.5">It was also emailed. The link is single-use and expires in 72 hours.</p>
      <div className="flex gap-2 mt-2">
        <Input readOnly value={link} className="font-mono text-[12px] h-8" />
        <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function Tabs({ tabs, value, onChange }: { tabs: Array<{ value: string; label: React.ReactNode }>; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1 border-b border-gray-200 dark:border-[#1e1e21] mb-4 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`px-3 py-2 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
            value === t.value ? "border-primary text-gray-900 dark:text-gray-50" : "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
