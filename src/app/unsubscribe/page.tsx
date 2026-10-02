"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorNote, api } from "@/components/platform/kit";
import { PublicShell } from "@/components/platform/public-shell";

function Unsubscribe() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  async function confirm() {
    setState("busy");
    try {
      const r = await api<{ email: string }>("/api/public/unsubscribe", { body: { token } });
      setEmail(r.email);
      setState("done");
    } catch (e) {
      setErr((e as Error).message);
      setState("idle");
    }
  }

  return (
    <PublicShell title={state === "done" ? "You are unsubscribed" : "Unsubscribe from marketing emails"}>
      {state === "done" ? (
        <p className="text-[14px]">{email} will no longer receive promotional emails. You will still receive important account emails (receipts, expiry reminders, maintenance notices).</p>
      ) : (
        <div className="space-y-3">
          <p className="text-[14px] text-gray-600 dark:text-gray-300">You will stop receiving offers and product news. Account emails are not affected.</p>
          <ErrorNote message={err} />
          <Button onClick={confirm} disabled={!token || state === "busy"} className="w-full">Unsubscribe</Button>
        </div>
      )}
    </PublicShell>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense>
      <Unsubscribe />
    </Suspense>
  );
}
