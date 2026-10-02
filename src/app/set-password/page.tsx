"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorNote, Field, api } from "@/components/platform/kit";
import { PublicShell } from "@/components/platform/public-shell";

function SetPasswordForm() {
  const sp = useSearchParams();
  const token = sp.get("token");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) return setErr("Passwords do not match");
    setBusy(true);
    setErr(null);
    try {
      await api("/api/public/set-password", { body: { token, password: pw } });
      setDone("Your password is set. You can sign in now.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ message: string }>("/api/public/set-password", { body: { action: "request_reset", email } });
      setDone(r.message);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <PublicShell title="Done">
        <div className="text-center py-3">
          <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
          <p className="text-[14px]">{done}</p>
          <Link href="/login"><Button className="mt-4">Go to sign in</Button></Link>
        </div>
      </PublicShell>
    );
  }

  if (!token) {
    return (
      <PublicShell title="Forgot your password?" subtitle="Enter your email and we will send a reset link (valid 60 minutes).">
        <form onSubmit={requestReset} className="space-y-3">
          <Field label="Email"><Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <ErrorNote message={err} />
          <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Send reset link</Button>
        </form>
      </PublicShell>
    );
  }

  return (
    <PublicShell title={sp.get("reset") ? "Reset your password" : "Set your password"} subtitle="Choose a password with at least 8 characters.">
      <form onSubmit={submit} className="space-y-3">
        <Field label="New password"><Input required type="password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Confirm password"><Input required type="password" minLength={8} value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        <ErrorNote message={err} />
        <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Save password</Button>
      </form>
    </PublicShell>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense>
      <SetPasswordForm />
    </Suspense>
  );
}
