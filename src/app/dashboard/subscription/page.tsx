"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, ErrorNote, Field, Loading, NativeSelect, PageHeader, Panel, StatusBadge, Td, Th, api, dmy, label, pkr, useApi, useDebounced } from "@/components/platform/kit";
import { QuoteBreakdown, QuoteView } from "@/components/platform/order-form";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function SubscriptionPage() {
  const sub = useApi<any>("/api/tenant/subscription");
  const orders = useApi<{ data: any[] }>("/api/tenant/orders");
  const [f, setF] = useState({ upgrade: false, seats: "", branches: "", term_quarters: "1", promo_code: "" });
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [placed, setPlaced] = useState<any>(null);
  const s = sub.data;

  useEffect(() => {
    if (s && !f.seats) setF((x) => ({ ...x, seats: String(Math.max(s.limits.seats, s.usage.seats)), branches: String(s.limits.branches) }));
  }, [s, f.seats]);

  const key = useDebounced(JSON.stringify(f), 350);
  useEffect(() => {
    if (!s?.is_owner || !f.seats) return;
    api<{ quote: QuoteView }>("/api/tenant/quotes", { body: { upgrade: f.upgrade, seats: Number(f.seats), branches: Number(f.branches), term_quarters: Number(f.term_quarters), promo_code: f.promo_code || undefined } })
      .then((r) => { setQuote(r.quote); setQuoteErr(null); })
      .catch((e) => { setQuote(null); setQuoteErr(e.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, s?.is_owner]);

  if (sub.loading && !s) return <Loading />;
  if (sub.error) return <ErrorNote message={sub.error} />;
  if (!s) return null;

  const pay = s.payment_instructions;
  const wa = (s.support_contact?.whatsapp || "").replace(/[^\d]/g, "");
  const pending = placed?.order ?? s.pending_order;
  const waText = pending ? `Payment for TripSync order ${pending.order_number}\nReference: ${pending.payment_reference}\nAgency: ${s.agency.name}\nAmount: PKR ${Number(pending.total_due).toLocaleString("en-PK")}` : "";

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<any>("/api/tenant/orders", { body: { upgrade: f.upgrade, seats: Number(f.seats), branches: Number(f.branches), term_quarters: Number(f.term_quarters), promo_code: f.promo_code || undefined } });
      setPlaced(r);
      sub.reload();
      orders.reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel(id: string) {
    if (!confirm("Cancel this pending order?")) return;
    await api(`/api/tenant/orders/${id}`, { body: {} }).catch((e) => alert(e.message));
    setPlaced(null);
    sub.reload();
    orders.reload();
  }

  return (
    <div className="max-w-6xl">
      <PageHeader title="Subscription" subtitle={s.agency.name} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Panel><p className="text-[11px] uppercase font-semibold text-gray-400 pt-3">Status</p><div className="mt-1"><StatusBadge status={s.status} /></div></Panel>
        <Panel><p className="text-[11px] uppercase font-semibold text-gray-400 pt-3">Access until</p><p className="text-lg font-semibold">{dmy(s.expires_at)}</p><p className="text-[12px] text-gray-500">{s.days_left !== null ? (s.days_left > 0 ? `${s.days_left} days left` : "Expired") : ""}</p></Panel>
        <Panel><p className="text-[11px] uppercase font-semibold text-gray-400 pt-3">Users</p><p className="text-lg font-semibold">{s.usage.seats} / {s.limits.seats}</p></Panel>
        <Panel><p className="text-[11px] uppercase font-semibold text-gray-400 pt-3">Branches</p><p className="text-lg font-semibold">{s.usage.branches} / {s.limits.branches}</p></Panel>
      </div>

      {pending ? (
        <Panel title="Payment pending verification" className="mb-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 py-2 text-[13px]">
            <div className="space-y-2">
              <p>Order <b className="font-mono">{pending.order_number}</b> · Amount due <b>{pkr(pending.total_due)}</b></p>
              <p>Payment reference: <span className="font-mono text-lg font-bold tracking-wider">{pending.payment_reference}</span></p>
              {(pay.bank_name || pay.account_number) && (
                <div className="rounded-lg bg-gray-50 dark:bg-[#0e0e10] p-3 space-y-0.5">
                  {pay.bank_name && <p>Bank: <b>{pay.bank_name}</b></p>}
                  {pay.account_title && <p>Account title: <b>{pay.account_title}</b></p>}
                  {pay.account_number && <p>Account number: <b className="font-mono">{pay.account_number}</b></p>}
                  {pay.iban && <p>IBAN: <b className="font-mono">{pay.iban}</b></p>}
                </div>
              )}
              <p className="text-gray-500">Pay by bank transfer or QR, then send the screenshot with your reference on WhatsApp. Access is extended as soon as we verify the payment.</p>
              <div className="flex gap-2">
                {wa && <a href={`https://wa.me/${wa}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noreferrer"><Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"><MessageCircle className="h-4 w-4" /> Send screenshot on WhatsApp</Button></a>}
                {s.is_owner && <Button variant="outline" onClick={() => cancel(String(pending._id))}>Cancel order</Button>}
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {pay.qr_image_url && <img src={pay.qr_image_url} alt="Payment QR" className="max-h-56 rounded-lg border mx-auto" />}
          </div>
        </Panel>
      ) : s.is_owner ? (
        <Panel title={s.status === "TRIAL" ? "Upgrade to a paid plan" : "Renew or upgrade"} className="mb-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 py-2">
            <div className="space-y-3">
              {s.status === "ACTIVE" && (
                <div className="flex gap-1 text-[12px]">
                  {[false, true].map((u) => (
                    <button key={String(u)} onClick={() => setF({ ...f, upgrade: u })} className={`px-3 py-1.5 rounded-lg border ${f.upgrade === u ? "bg-primary text-primary-foreground border-primary" : "border-gray-200 dark:border-[#1e1e21]"}`}>
                      {u ? "Add seats / branches now" : "Renew"}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <Field label="Seats (users)"><Input type="number" min={s.usage.seats} value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value })} /></Field>
                <Field label="Branches"><Input type="number" min={1} value={f.branches} onChange={(e) => setF({ ...f, branches: e.target.value })} /></Field>
                {!f.upgrade && <Field label="Term"><NativeSelect className="w-full" value={f.term_quarters} onChange={(v) => setF({ ...f, term_quarters: v })} options={["1", "2", "3", "4"].map((q) => ({ value: q, label: `${Number(q) * 3} months` }))} /></Field>}
              </div>
              <Field label="Promo code"><Input value={f.promo_code} onChange={(e) => setF({ ...f, promo_code: e.target.value.toUpperCase() })} className="font-mono" /></Field>
              {f.upgrade ? <p className="text-[12px] text-gray-500">You pay a prorated top-up for the days left in your current period. Reductions take effect at renewal.</p> : s.status === "ACTIVE" ? <p className="text-[12px] text-gray-500">The new period starts when your current one ends — no days are lost.</p> : null}
            </div>
            <div className="space-y-3">
              <QuoteBreakdown quote={quote} />
              <ErrorNote message={quoteErr || err} />
              <Button className="w-full" disabled={busy || !quote || Boolean(quote?.promo_error)} onClick={submit}>
                {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Place order — {quote ? pkr(quote.total_due) : ""}
              </Button>
            </div>
          </div>
        </Panel>
      ) : (
        <p className="text-[13px] text-gray-500 mb-5">Only the agency owner can renew or change the plan.</p>
      )}

      <Panel title="Orders & receipts">
        <DataTable empty={!orders.data?.data.length} head={<><Th>Order</Th><Th>Type</Th><Th>Status</Th><Th>Plan</Th><Th className="text-right">Total</Th><Th>Date</Th><Th>Receipt</Th></>}>
          {orders.data?.data.map((o) => (
            <tr key={o._id}>
              <Td className="font-mono">{o.order_number}</Td>
              <Td>{label(o.type)}</Td>
              <Td><StatusBadge status={o.status} />{o.reject_reason && <p className="text-[11px] text-gray-500">{o.reject_reason}</p>}</Td>
              <Td className="text-[12px]">{o.seats} users / {o.branches} br{o.months ? ` · ${o.months} mo` : ""}</Td>
              <Td className="text-right font-mono">{pkr(o.total_due)}</Td>
              <Td>{dmy(o.created_at)}</Td>
              <Td>{o.receipt ? <Link className="font-mono text-[12px] hover:underline" href={`/dashboard/subscription/receipts/${o.receipt.id}/print`} target="_blank">{o.receipt.receipt_number}{o.receipt.voided ? " (void)" : ""}</Link> : "-"}</Td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  );
}
