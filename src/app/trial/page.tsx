"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorNote, Field, api } from "@/components/platform/kit";
import { Honeypot, PublicShell } from "@/components/platform/public-shell";

function TrialForm() {
  const sp = useSearchParams();
  const [f, setF] = useState({ owner_name: "", email: "", phone: "", business_name: "", data_consent: false, marketing_consent: false, website: "", ref: sp.get("ref") ?? "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ message: string }>("/api/public/trials", { body: f });
      setDone(r.message);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <PublicShell title="Check your email">
        <div className="text-center py-4">
          <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
          <p className="text-[14px]">{done}</p>
          <p className="text-[12px] text-gray-500 mt-2">The link is valid for 72 hours.</p>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell title="Start your free trial" subtitle="7 days of full access to the TripSync Finance Suite. No payment needed.">
      <form onSubmit={submit} className="space-y-3 relative">
        <Honeypot value={f.website} onChange={(v) => setF({ ...f, website: v })} />
        <Field label="Your name"><Input required value={f.owner_name} onChange={(e) => setF({ ...f, owner_name: e.target.value })} /></Field>
        <Field label="Email"><Input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Phone / WhatsApp"><Input required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="03xx xxxxxxx" /></Field>
        <Field label="Agency / business name"><Input required value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} /></Field>
        <label className="flex items-start gap-2 text-[12px]">
          <input type="checkbox" className="mt-0.5" checked={f.data_consent} onChange={(e) => setF({ ...f, data_consent: e.target.checked })} />
          <span>I agree that TripSync stores and processes the information I provide to run my account (required).</span>
        </label>
        <label className="flex items-start gap-2 text-[12px]">
          <input type="checkbox" className="mt-0.5" checked={f.marketing_consent} onChange={(e) => setF({ ...f, marketing_consent: e.target.checked })} />
          <span>Send me offers and product news by email. I can unsubscribe at any time (optional).</span>
        </label>
        <ErrorNote message={err} />
        <Button type="submit" className="w-full" disabled={busy || !f.data_consent}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Start free trial</Button>
        <p className="text-[12px] text-center text-gray-500">Ready to buy? <Link href="/buy" className="underline">Purchase a plan</Link> · Already have an account? <Link href="/login" className="underline">Sign in</Link></p>
      </form>
    </PublicShell>
  );
}

export default function TrialPage() {
  return (
    <Suspense>
      <TrialForm />
    </Suspense>
  );
}
