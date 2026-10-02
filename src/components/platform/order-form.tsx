"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorNote, Field, NativeSelect, api, pkr, qs, useDebounced, useMe } from "./kit";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface QuoteView {
  type: string;
  lines: { label: string; amount: number }[];
  total_due: number;
  promo_error: string | null;
  months: number;
  remaining_days: number | null;
}

export function QuoteBreakdown({ quote, loading }: { quote: QuoteView | null; loading?: boolean }) {
  if (loading && !quote) return <div className="flex items-center gap-2 text-[13px] text-gray-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculating…</div>;
  if (!quote) return null;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-[#1e1e21] p-3 text-[13px] space-y-1">
      <p className="text-[11px] uppercase font-semibold text-gray-400 mb-1">Price breakdown · {quote.type.toLowerCase()}</p>
      {quote.lines.map((l, i) => (
        <div key={i} className="flex justify-between gap-3">
          <span className="text-gray-600 dark:text-gray-300">{l.label}</span>
          <span className={`font-mono ${l.amount < 0 ? "text-emerald-600" : ""}`}>{l.amount < 0 ? `− ${pkr(-l.amount)}` : pkr(l.amount)}</span>
        </div>
      ))}
      <div className="flex justify-between border-t border-gray-100 dark:border-[#1e1e21] pt-1.5 mt-1.5 font-semibold">
        <span>Total due</span>
        <span className="font-mono">{pkr(quote.total_due)}</span>
      </div>
      {quote.promo_error && <p className="text-[12px] text-red-600">{quote.promo_error}</p>}
    </div>
  );
}

export function NewOrderDialog({ open, onClose, presetAgencyId, onCreated }: { open: boolean; onClose: () => void; presetAgencyId?: string | null; onCreated: (r: any) => void }) {
  const me = useMe();
  const isSA = me?.user.role === "SuperAdmin";
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [agencySearch, setAgencySearch] = useState("");
  const [agencyOptions, setAgencyOptions] = useState<any[]>([]);
  const [agency, setAgency] = useState<any | null>(null);
  const [na, setNa] = useState({ business_name: "", owner_name: "", owner_email: "", owner_phone: "", business_address: "" });
  const [f, setF] = useState({ upgrade: false, seats: "5", branches: "1", term_quarters: "1", promo_code: "", payment_method: "CASH", amount_received: "", collected_by: "", collected_at: new Date().toISOString().slice(0, 10), payment_note: "", manual_adjustment: "", adjustment_reason: "", amount_override_reason: "" });
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<{ id: string; name: string; role: string }[]>([]);
  const dSearch = useDebounced(agencySearch);

  useEffect(() => {
    if (!open) return;
    api<{ staff: any[] }>("/api/admin/lookups").then((r) => setStaff(r.staff.filter((s) => s.is_active))).catch(() => {});
    if (presetAgencyId) {
      api<any>(`/api/admin/agencies/${presetAgencyId}`).then((r) => {
        setAgency(r.agency);
        setMode("existing");
        setF((x) => ({ ...x, seats: String(Math.max(r.agency.seat_limit, r.agency.user_count)), branches: String(r.agency.branch_limit) }));
      }).catch(() => {});
    }
  }, [open, presetAgencyId]);

  useEffect(() => {
    if (!open || mode !== "existing" || !dSearch) return setAgencyOptions([]);
    api<{ data: any[] }>(`/api/admin/agencies${qs({ q: dSearch, page_size: 8 })}`).then((r) => setAgencyOptions(r.data)).catch(() => {});
  }, [dSearch, open, mode]);

  const quoteKey = JSON.stringify([mode, agency?._id, f.upgrade, f.seats, f.branches, f.term_quarters, f.promo_code, f.manual_adjustment]);
  const dQuoteKey = useDebounced(quoteKey, 350);
  useEffect(() => {
    if (!open) return;
    if (mode === "existing" && !agency) return setQuote(null);
    setQuoting(true);
    api<{ quote: QuoteView }>("/api/admin/pricing/quote", {
      body: {
        agency_id: mode === "existing" ? agency?._id : undefined,
        upgrade: f.upgrade,
        seats: Number(f.seats),
        branches: Number(f.branches),
        term_quarters: Number(f.term_quarters),
        promo_code: f.promo_code || undefined,
        manual_adjustment: isSA && f.manual_adjustment ? Number(f.manual_adjustment) : undefined,
      },
    })
      .then((r) => { setQuote(r.quote); setQuoteErr(null); })
      .catch((e) => { setQuote(null); setQuoteErr(e.message); })
      .finally(() => setQuoting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dQuoteKey, open]);

  const set = (k: keyof typeof f) => (v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const amount = f.amount_received === "" ? quote?.total_due ?? 0 : Number(f.amount_received);
  const mismatch = quote && amount !== quote.total_due;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api("/api/admin/orders", {
        body: {
          agency_id: mode === "existing" ? agency?._id : null,
          new_agency: mode === "new" ? na : null,
          upgrade: f.upgrade,
          seats: Number(f.seats),
          branches: Number(f.branches),
          term_quarters: Number(f.term_quarters),
          promo_code: f.promo_code || null,
          payment_method: f.payment_method,
          amount_received: amount,
          collected_by: f.collected_by || null,
          collected_at: f.collected_at ? new Date(`${f.collected_at}T12:00:00+05:00`).toISOString() : null,
          payment_note: f.payment_note,
          manual_adjustment: isSA && f.manual_adjustment ? Number(f.manual_adjustment) : 0,
          adjustment_reason: f.adjustment_reason,
          amount_override_reason: f.amount_override_reason,
        },
      });
      onCreated(r);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const collector = f.collected_by || me?.user.id;
  const autoApprove = (me?.user.role === "SuperAdmin" || me?.user.role === "Manager") && collector === me?.user.id;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-base font-semibold">Record order / payment</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
          <div className="space-y-3">
            {!presetAgencyId && (
              <div className="flex gap-1 text-[12px]">
                {(["existing", "new"] as const).map((m) => (
                  <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 rounded-lg border ${mode === m ? "bg-primary text-primary-foreground border-primary" : "border-gray-200 dark:border-[#1e1e21]"}`}>
                    {m === "existing" ? "Existing agency" : "New agency"}
                  </button>
                ))}
              </div>
            )}
            {mode === "existing" ? (
              agency ? (
                <div className="rounded-lg border border-gray-200 dark:border-[#1e1e21] p-3 text-[13px]">
                  <div className="flex justify-between"><b>{agency.name}</b>{!presetAgencyId && <button className="text-[12px] text-gray-500 hover:underline" onClick={() => setAgency(null)}>Change</button>}</div>
                  <p className="text-[12px] text-gray-500">{agency.status} · {agency.user_count} users · limit {agency.seat_limit} seats / {agency.branch_limit} br</p>
                </div>
              ) : (
                <Field label="Agency">
                  <Input placeholder="Search agency…" value={agencySearch} onChange={(e) => setAgencySearch(e.target.value)} />
                  {agencyOptions.length > 0 && (
                    <div className="border border-gray-200 dark:border-[#1e1e21] rounded-lg divide-y divide-gray-100 dark:divide-[#1e1e21] max-h-48 overflow-y-auto">
                      {agencyOptions.map((o) => (
                        <button key={o._id} className="w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50 dark:hover:bg-[#151517]" onClick={() => { setAgency(o); setF((x) => ({ ...x, seats: String(Math.max(o.seat_limit, o.user_count)), branches: String(o.branch_limit) })); setAgencyOptions([]); }}>
                          {o.name} <span className="text-gray-400 text-[11px]">{o.status} · {o.owner.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </Field>
              )
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Business name *" className="col-span-2"><Input value={na.business_name} onChange={(e) => setNa({ ...na, business_name: e.target.value })} /></Field>
                <Field label="Owner name *"><Input value={na.owner_name} onChange={(e) => setNa({ ...na, owner_name: e.target.value })} /></Field>
                <Field label="Owner email *"><Input value={na.owner_email} onChange={(e) => setNa({ ...na, owner_email: e.target.value })} /></Field>
                <Field label="Owner phone"><Input value={na.owner_phone} onChange={(e) => setNa({ ...na, owner_phone: e.target.value })} /></Field>
                <Field label="Address"><Input value={na.business_address} onChange={(e) => setNa({ ...na, business_address: e.target.value })} /></Field>
              </div>
            )}

            {mode === "existing" && agency?.status === "ACTIVE" && (
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={f.upgrade} onChange={(e) => set("upgrade")(e.target.checked)} /> Mid-term upgrade (prorated top-up, no new period)</label>
            )}
            <div className="grid grid-cols-3 gap-3">
              <Field label="Seats"><Input type="number" min={1} value={f.seats} onChange={(e) => set("seats")(e.target.value)} /></Field>
              <Field label="Branches"><Input type="number" min={1} value={f.branches} onChange={(e) => set("branches")(e.target.value)} /></Field>
              {!f.upgrade && (
                <Field label="Term">
                  <NativeSelect value={f.term_quarters} onChange={set("term_quarters")} className="w-full" options={["1", "2", "3", "4"].map((q) => ({ value: q, label: `${q} quarter${q === "1" ? "" : "s"} (${Number(q) * 3} mo)` }))} />
                </Field>
              )}
            </div>
            <Field label="Promo code"><Input value={f.promo_code} onChange={(e) => set("promo_code")(e.target.value.toUpperCase())} className="font-mono" /></Field>
            {isSA && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Manual adjustment (±PKR)"><Input type="number" value={f.manual_adjustment} onChange={(e) => set("manual_adjustment")(e.target.value)} /></Field>
                <Field label="Adjustment reason"><Input value={f.adjustment_reason} onChange={(e) => set("adjustment_reason")(e.target.value)} /></Field>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <QuoteBreakdown quote={quote} loading={quoting} />
            <ErrorNote message={quoteErr} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Payment method"><NativeSelect value={f.payment_method} onChange={set("payment_method")} className="w-full" options={[{ value: "CASH", label: "Cash" }, { value: "BANK_TRANSFER", label: "Bank transfer / QR" }]} /></Field>
              <Field label="Amount received"><Input type="number" placeholder={quote ? String(quote.total_due) : ""} value={f.amount_received} onChange={(e) => set("amount_received")(e.target.value)} /></Field>
              <Field label="Collected by"><NativeSelect value={f.collected_by} onChange={set("collected_by")} className="w-full" placeholder={`Me (${me?.user.name ?? ""})`} options={staff.filter((s) => s.id !== me?.user.id).map((s) => ({ value: s.id, label: `${s.name} (${s.role})` }))} /></Field>
              <Field label="Collected on"><Input type="date" value={f.collected_at} onChange={(e) => set("collected_at")(e.target.value)} /></Field>
            </div>
            {mismatch && (
              isSA ? <Field label="Reason amount differs from total *"><Input value={f.amount_override_reason} onChange={(e) => set("amount_override_reason")(e.target.value)} /></Field>
                : <p className="text-[12px] text-red-600">Amount received must equal the total due.</p>
            )}
            <Field label="Payment note"><Textarea value={f.payment_note} onChange={(e) => set("payment_note")(e.target.value)} className="min-h-[50px]" /></Field>
            <p className={`text-[12px] ${autoApprove ? "text-emerald-600" : "text-amber-600"}`}>
              {autoApprove ? "You collected this payment — the order will be approved immediately (audit-logged)." : "This order will wait in the approval queue for a Manager / Super Admin."}
            </p>
            <ErrorNote message={error} />
            <Button className="w-full" disabled={busy || !quote || Boolean(quote?.promo_error) || (mode === "existing" && !agency)} onClick={submit}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Record order
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
