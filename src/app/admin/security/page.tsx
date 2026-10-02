"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorNote, Field, PageHeader, Panel, api, useMe } from "@/components/platform/kit";

export default function SecurityPage() {
  const me = useMe();
  const [setup, setSetup] = useState<{ secret: string; otpauth_uri: string; qr_data_url: string } | null>(null);
  const [code, setCode] = useState("");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const isEnabled = enabled ?? me?.totp_enabled ?? false;

  const call = async (body: Record<string, unknown>, ok: (r: Record<string, unknown>) => void) => {
    setErr(null);
    setMsg(null);
    try {
      ok(await api("/api/admin/security", { body }));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title="Security" subtitle={`${me?.user.name ?? ""} · ${me?.user.email ?? ""}`} />
      {me?.requires_2fa_setup && !isEnabled && (
        <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-4 py-3 text-[13px] text-amber-800 dark:text-amber-300">
          Two-factor authentication is required for your role. Set it up to continue using the admin panel.
        </div>
      )}
      <Panel title="Two-factor authentication (TOTP)">
        {isEnabled ? (
          <div className="space-y-3 py-2">
            <p className="flex items-center gap-2 text-[13px] text-emerald-600"><ShieldCheck className="h-4 w-4" /> Enabled — you will be asked for a 6-digit code at sign-in.</p>
            {me?.user.role === "SalesExecutive" && (
              <div className="flex gap-2">
                <Input placeholder="Current code to disable" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className="w-48 font-mono" />
                <Button variant="outline" onClick={() => call({ action: "disable", code }, () => { setEnabled(false); setCode(""); })}>Disable</Button>
              </div>
            )}
          </div>
        ) : !setup ? (
          <div className="py-2">
            <p className="text-[13px] text-gray-600 dark:text-gray-300 mb-3">Use Google Authenticator, Microsoft Authenticator, Authy or 1Password.</p>
            <Button onClick={() => call({ action: "setup" }, (r) => setSetup(r as { secret: string; otpauth_uri: string; qr_data_url: string }))}>Set up 2FA</Button>
          </div>
        ) : (
          <div className="space-y-3 py-2 text-[13px]">
            <p>1. Scan this QR code with your authenticator app:</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr_data_url} alt="2FA QR code" width={220} height={220} className="rounded-lg bg-white p-2 border" />
            <p className="text-[12px] text-gray-500">Can&apos;t scan? Choose <b>Enter a setup key</b> in the app and type this key (account: {me?.user.email}, time-based):</p>
            <p className="font-mono text-base tracking-wider bg-gray-50 dark:bg-[#0e0e10] rounded-lg px-3 py-2 break-all select-all">{setup.secret.match(/.{1,4}/g)?.join(" ")}</p>
            <p>2. Enter the 6-digit code it shows:</p>
            <div className="flex gap-2">
              <Input name="totp-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="w-40 font-mono tracking-widest" />
              <Button onClick={() => call({ action: "enable", code }, () => { setEnabled(true); setSetup(null); setCode(""); setMsg("2FA enabled."); setTimeout(() => window.location.reload(), 800); })}>Verify & enable</Button>
            </div>
          </div>
        )}
      </Panel>
      <Panel title="Change password" className="mt-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          <Field label="Current password"><Input type="password" name="current-password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
          <Field label="New password (min 8)"><Input type="password" name="new-password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
        </div>
        <Button onClick={() => call({ action: "change_password", ...pw }, () => { setPw({ current_password: "", new_password: "" }); setMsg("Password changed."); })}>Change password</Button>
      </Panel>
      <div className="mt-3">
        <ErrorNote message={err} />
        {msg && <p className="text-[13px] text-emerald-600">{msg}</p>}
      </div>
    </div>
  );
}
