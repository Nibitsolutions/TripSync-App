"use client";

import { useEffect, useState } from "react";
import { Loader2, Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, ErrorNote, Field, Loading, PageHeader, Panel, Tabs, Td, Th, api, dmy, useApi } from "@/components/platform/kit";

/* eslint-disable @typescript-eslint/no-explicit-any */
type FieldDef = { key: string; label: string; type?: "text" | "number" | "password" | "checkbox" | "textarea" | "list"; hint?: string };

const SECTIONS: Array<{ key: string; title: string; description: string; fields: FieldDef[] }> = [
  { key: "smtp", title: "SMTP", description: "Own SMTP server — all mail goes through the email outbox with retries.", fields: [{ key: "host", label: "Host" }, { key: "port", label: "Port", type: "number" }, { key: "secure", label: "Use TLS (port 465)", type: "checkbox" }, { key: "username", label: "Username" }, { key: "password", label: "Password", type: "password", hint: "Stored encrypted; leave blank to keep the current password" }] },
  { key: "email_from", title: "Sender", description: "No-reply address; replies go to the support email.", fields: [{ key: "address", label: "From address" }, { key: "name", label: "Display name" }, { key: "reply_to", label: "Reply-to (empty = support email)" }] },
  { key: "email_throttle", title: "Email throttle", description: "Keep at or below your SMTP provider's limits.", fields: [{ key: "per_minute", label: "Messages per minute", type: "number" }, { key: "per_hour", label: "Messages per hour", type: "number" }] },
  { key: "support_contact", title: "Support contact", description: "Shown on locked screens, emails and the purchase confirmation (WhatsApp link).", fields: [{ key: "whatsapp", label: "WhatsApp number (with country code)" }, { key: "email", label: "Support email" }] },
  { key: "payment_instructions", title: "Payment details", description: "Shown on the purchase form, renewal screen and order email.", fields: [{ key: "bank_name", label: "Bank" }, { key: "account_title", label: "Account title" }, { key: "account_number", label: "Account number" }, { key: "iban", label: "IBAN" }, { key: "qr_image_url", label: "QR image URL (https)" }] },
  { key: "trial_days", title: "Trial length", description: "Days for new trials.", fields: [{ key: "", label: "Trial days", type: "number" }] },
  { key: "expiry_reminder_offsets_hours", title: "Expiry reminders", description: "Hours before expiry (default 504, 336, 168, 24 = 21d, 14d, 7d, 24h). Trials get 24 h.", fields: [{ key: "", label: "Offsets (comma separated hours)", type: "list" }] },
  { key: "default_retention_months", title: "Retention", description: "Default months to keep an offboarded agency's data live.", fields: [{ key: "", label: "Months", type: "number" }] },
  { key: "locked_messages", title: "Locked screen messages", description: "Shown after correct credentials only.", fields: [{ key: "suspended", label: "Suspended", type: "textarea" }, { key: "offboarded", label: "Offboarded / closed", type: "textarea" }] },
  { key: "receipt_tax", title: "Receipt & tax", description: "Keep tax disabled until confirmed with your accountant.", fields: [{ key: "enabled", label: "Charge tax", type: "checkbox" }, { key: "rate_percent", label: "Tax rate %", type: "number" }, { key: "seller_name", label: "Seller name" }, { key: "seller_address", label: "Seller address", type: "textarea" }, { key: "seller_ntn", label: "NTN (shown only when tax is enabled)" }] },
  { key: "notification_toggles", title: "Notifications", description: "Optional lifecycle and support emails.", fields: [{ key: "suspension_email", label: "Suspension email", type: "checkbox" }, { key: "offboard_email", label: "Offboarding email", type: "checkbox" }, { key: "reactivation_email", label: "Reactivation email", type: "checkbox" }, { key: "ticket_emails", label: "Ticket emails", type: "checkbox" }] },
  { key: "security", title: "Security", description: "Two-factor authentication for Super Admin and Manager.", fields: [{ key: "enforce_2fa", label: "Require 2FA for Super Admin & Manager", type: "checkbox" }] },
];

function Section({ def, value, canWrite }: { def: (typeof SECTIONS)[number]; value: any; canWrite: boolean }) {
  const [v, setV] = useState<any>(value);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setV(value), [value]);

  const get = (k: string) => (k ? v?.[k] : v);
  const put = (k: string, val: unknown) => setV((cur: any) => (k ? { ...cur, [k]: val } : val));

  async function save() {
    setBusy(true); setMsg(null); setErr(null);
    try {
      await api(`/api/admin/settings/${def.key}`, { method: "PUT", body: { value: v } });
      setMsg("Saved");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setMsg(null); setErr(null);
    try {
      const r = await api<any>("/api/admin/settings/smtp", { body: {} });
      setMsg(`Test email sent to ${r.sent_to}`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Panel title={def.title}>
      <p className="text-[12px] text-gray-500 mb-3">{def.description}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {def.fields.map((f) => (
          <Field key={f.key || def.key} label={f.label} hint={f.hint} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
            {f.type === "checkbox" ? (
              <input type="checkbox" disabled={!canWrite} checked={Boolean(get(f.key))} onChange={(e) => put(f.key, e.target.checked)} />
            ) : f.type === "textarea" ? (
              <Textarea disabled={!canWrite} value={get(f.key) ?? ""} onChange={(e) => put(f.key, e.target.value)} />
            ) : f.type === "list" ? (
              <Input disabled={!canWrite} value={(get(f.key) ?? []).join(", ")} onChange={(e) => put(f.key, e.target.value.split(",").map((x) => Number(x.trim())).filter((n) => n > 0))} />
            ) : (
              <Input
                disabled={!canWrite}
                type={f.type === "number" ? "number" : f.type === "password" ? "password" : "text"}
                placeholder={f.type === "password" && v?.password_set ? "•••••••• (set)" : ""}
                value={f.type === "password" ? (get(f.key) === "••••••••" ? "" : get(f.key) ?? "") : get(f.key) ?? ""}
                onChange={(e) => put(f.key, f.type === "number" ? Number(e.target.value) : e.target.value)}
              />
            )}
          </Field>
        ))}
      </div>
      {def.key === "payment_instructions" && v?.qr_image_url && /^https:/.test(v.qr_image_url) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={v.qr_image_url} alt="Payment QR" className="h-28 mt-3 rounded border" />
      )}
      {canWrite && (
        <div className="flex items-center gap-2 mt-3">
          <Button size="sm" onClick={save} disabled={busy} className="gap-1.5">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save</Button>
          {def.key === "smtp" && <Button size="sm" variant="outline" onClick={test} disabled={busy}>Send test email</Button>}
          {msg && <span className="text-[12px] text-emerald-600">{msg}</span>}
        </div>
      )}
      <ErrorNote message={err} />
    </Panel>
  );
}

function Jobs({ canWrite }: { canWrite: boolean }) {
  const { data, loading, error, reload } = useApi<any>("/api/admin/jobs");
  const [running, setRunning] = useState<string | null>(null);
  return (
    <Panel title="Background jobs & email outbox">
      <ErrorNote message={error} />
      {loading && !data ? <Loading /> : data && (
        <>
          <p className="text-[12px] text-gray-500 mb-2">Outbox: {Object.entries(data.outbox).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(" · ") || "empty"}</p>
          <DataTable head={<><Th>Job</Th><Th>Every</Th><Th>Last started</Th><Th>Last finished</Th><Th>Failures</Th><Th>Last error</Th>{canWrite && <Th></Th>}</>}>
            {data.jobs.map((j: any) => (
              <tr key={j.name}>
                <Td className="font-mono text-[12px]">{j.name}</Td>
                <Td className="text-[12px]">{j.every_ms >= 3_600_000 ? `${j.every_ms / 3_600_000}h` : j.every_ms >= 60_000 ? `${j.every_ms / 60_000}m` : `${j.every_ms / 1000}s`}</Td>
                <Td className="text-[12px]">{dmy(j.last_started_at, true)}</Td>
                <Td className="text-[12px]">{dmy(j.last_finished_at, true)}</Td>
                <Td>{j.consecutive_failures ?? 0}</Td>
                <Td className="text-[11px] text-red-600 max-w-[260px]">{j.last_error ?? ""}</Td>
                {canWrite && <Td><Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" disabled={running === j.name} onClick={async () => { setRunning(j.name); await api("/api/admin/jobs", { body: { name: j.name } }).catch((e) => alert(e.message)); setRunning(null); reload(); }}><Play className="h-3 w-3" /> Run</Button></Td>}
              </tr>
            ))}
          </DataTable>
        </>
      )}
    </Panel>
  );
}

export default function SettingsPage() {
  const { data, loading, error } = useApi<{ settings: Record<string, any>; can_write: boolean }>("/api/admin/settings");
  const [tab, setTab] = useState("settings");
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote message={error} />;
  if (!data) return null;
  return (
    <div>
      <PageHeader title="Settings" subtitle={data.can_write ? "Platform configuration — every change is audit-logged (secrets redacted)" : "View only"} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "settings", label: "Settings" }, { value: "jobs", label: "Jobs & outbox" }]} />
      {tab === "settings" ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {SECTIONS.map((s) => <Section key={s.key} def={s} value={data.settings[s.key]} canWrite={data.can_write} />)}
        </div>
      ) : (
        <Jobs canWrite={data.can_write} />
      )}
    </div>
  );
}
