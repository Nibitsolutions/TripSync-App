"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorNote, Field, NativeSelect, api, pkr, useDebounced } from "@/components/platform/kit";
import { QuoteBreakdown, QuoteView } from "@/components/platform/order-form";
import { Honeypot, PublicShell } from "@/components/platform/public-shell";

/* eslint-disable @typescript-eslint/no-explicit-any */
function BuyForm() {
  const sp = useSearchParams();
  const [config, setConfig] = useState<any>(null);
  const [f, setF] = useState({
    owner_name: "", owner_email: "", owner_phone: "", business_name: "", business_address: "", business_phone: "", business_email: "",
    seats: "5", branches: "1", term_quarters: "1", promo_code: sp.get("code") ?? "", data_consent: false, marketing_consent: false, website: "",
  });
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<any>(null);

  useEffect(() => {
    api("/api/public/config").then(setConfig).catch(() => {});
  }, []);
  const key = useDebounced(JSON.stringify([f.seats, f.branches, f.term_quarters, f.promo_code]), 350);
  useEffect(() => {
    api<{ quote: QuoteView }>("/api/public/quotes", { body: { seats: Number(f.seats), branches: Number(f.branches), term_quarters: Number(f.term_quarters), promo_code: f.promo_code || undefined } })
      .then((r) => { setQuote(r.quote); setQuoteErr(null); })
      .catch((e) => { setQuote(null); setQuoteErr(e.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      setDone(await api("/api/public/orders", { body: { ...f, seats: Number(f.seats), branches: Number(f.branches), term_quarters: Number(f.term_quarters) } }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const pay = config?.payment_instructions;
  if (done) {
    return (
      <PublicShell title="Order received" wide>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[14px]">
          <div className="space-y-3">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            <p>Order <b className="font-mono">{done.order_number}</b> · Amount due <b>{pkr(done.total_due)}</b></p>
            <p>Your payment reference:</p>
            <p className="font-mono text-2xl font-bold tracking-widest">{done.payment_reference}</p>
            {pay && (
              <div className="rounded-lg bg-gray-50 dark:bg-[#0e0e10] p-3 text-[13px] space-y-0.5">
                {pay.bank_name && <p>Bank: <b>{pay.bank_name}</b></p>}
                {pay.account_title && <p>Account title: <b>{pay.account_title}</b></p>}
                {pay.account_number && <p>Account number: <b className="font-mono">{pay.account_number}</b></p>}
                {pay.iban && <p>IBAN: <b className="font-mono">{pay.iban}</b></p>}
              </div>
            )}
            <p className="text-[13px] text-gray-500">1. Pay by bank transfer or scan the QR. 2. Send the payment screenshot with your reference on WhatsApp. 3. We verify it and email your receipt and login link.</p>
            {done.whatsapp_link && <a href={done.whatsapp_link} target="_blank" rel="noreferrer"><Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"><MessageCircle className="h-4 w-4" /> Send screenshot on WhatsApp</Button></a>}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {pay?.qr_image_url && <img src={pay.qr_image_url} alt="Payment QR" className="max-h-72 rounded-lg border mx-auto" />}
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell title="Buy TripSync" subtitle={config?.campaign ? `🎉 ${config.campaign.name}: ${config.campaign.discount_type === "PERCENT" ? `${config.campaign.value}% off` : `${pkr(config.campaign.value)} off`}` : "Choose your plan — pay by bank transfer, QR or cash"} wide>
      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
        <Honeypot value={f.website} onChange={(v) => setF({ ...f, website: v })} />
        <div className="space-y-3">
          <p className="text-[11px] uppercase font-semibold text-gray-400">Owner</p>
          <Field label="Full name *"><Input required value={f.owner_name} onChange={(e) => setF({ ...f, owner_name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email *"><Input required type="email" value={f.owner_email} onChange={(e) => setF({ ...f, owner_email: e.target.value })} /></Field>
            <Field label="Phone / WhatsApp *"><Input required value={f.owner_phone} onChange={(e) => setF({ ...f, owner_phone: e.target.value })} /></Field>
          </div>
          <p className="text-[11px] uppercase font-semibold text-gray-400 pt-2">Business</p>
          <Field label="Business name *"><Input required value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} /></Field>
          <Field label="Address"><Input value={f.business_address} onChange={(e) => setF({ ...f, business_address: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Business phone"><Input value={f.business_phone} onChange={(e) => setF({ ...f, business_phone: e.target.value })} /></Field>
            <Field label="Business email"><Input type="email" value={f.business_email} onChange={(e) => setF({ ...f, business_email: e.target.value })} /></Field>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-[11px] uppercase font-semibold text-gray-400">Plan</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Users"><Input type="number" min={1} value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value })} /></Field>
            <Field label="Branches"><Input type="number" min={1} value={f.branches} onChange={(e) => setF({ ...f, branches: e.target.value })} /></Field>
            <Field label="Term"><NativeSelect className="w-full" value={f.term_quarters} onChange={(v) => setF({ ...f, term_quarters: v })} options={(config?.term_options ?? [1, 2, 3, 4]).map((q: number) => ({ value: String(q), label: `${q * 3} months` }))} /></Field>
          </div>
          <Field label="Promo code"><Input value={f.promo_code} onChange={(e) => setF({ ...f, promo_code: e.target.value.toUpperCase() })} className="font-mono" /></Field>
          <QuoteBreakdown quote={quote} />
          <ErrorNote message={quoteErr} />
          <label className="flex items-start gap-2 text-[12px]">
            <input type="checkbox" className="mt-0.5" checked={f.data_consent} onChange={(e) => setF({ ...f, data_consent: e.target.checked })} />
            <span>I agree that TripSync stores and processes this information to provide the service (required).</span>
          </label>
          <label className="flex items-start gap-2 text-[12px]">
            <input type="checkbox" className="mt-0.5" checked={f.marketing_consent} onChange={(e) => setF({ ...f, marketing_consent: e.target.checked })} />
            <span>Send me offers and product news by email (optional).</span>
          </label>
          <ErrorNote message={err} />
          <Button type="submit" className="w-full" disabled={busy || !f.data_consent || !quote || Boolean(quote?.promo_error)}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Place order {quote ? `— ${pkr(quote.total_due)}` : ""}
          </Button>
        </div>
      </form>
    </PublicShell>
  );
}

export default function BuyPage() {
  return (
    <Suspense>
      <BuyForm />
    </Suspense>
  );
}
