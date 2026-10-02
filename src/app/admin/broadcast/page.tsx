"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Eye, Loader2, Plus, Save, Send, TestTube2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DataTable, ErrorNote, Field, Loading, NativeSelect, PageHeader, Pager, Panel, StatusBadge, Td, Th, api, dmy, fromPktInput, label, qs, useApi, useCan,
} from "@/components/platform/kit";

/* eslint-disable @typescript-eslint/no-explicit-any */
const SAMPLE_VARS: Record<string, string> = {
  agency_name: "Sample Travel Agency",
  owner_name: "Ahmed Khan",
  expiry_date: "15-10-2026",
  days_left: "14",
  unsubscribe_url: "#",
};
const STARTER = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
  <h2 style="color:#111827">Hello {{owner_name}},</h2>
  <p>We have something new for <b>{{agency_name}}</b>.</p>
  <p><a href="https://tripsync.pk" style="background:#dc2626;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Learn more</a></p>
</div>`;

const emptyAudience = { statuses: [] as string[], expiring_within_days: "", sources: [] as string[], sales_owner_id: "", consent_only: false, created_from: "", created_to: "", trial_expired_never_paid: false };

function Composer({ id, onBack }: { id: string | null; onBack: () => void }) {
  const can = useCan();
  const canSend = can("broadcast.send");
  const [b, setB] = useState<any>({ subject: "", type: "PROMOTIONAL", html_body: STARTER, status: "DRAFT" });
  const [aud, setAud] = useState(emptyAudience);
  const [savedId, setSavedId] = useState<string | null>(id);
  const [preview, setPreview] = useState<any>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [schedule, setSchedule] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recPage, setRecPage] = useState(1);
  const lookups = useApi<any>("/api/admin/lookups");
  const recipients = useApi<any>(savedId && b.status !== "DRAFT" ? `/api/admin/broadcasts/${savedId}/recipients${qs({ page: recPage })}` : null, []);

  useEffect(() => {
    if (!id) return;
    api<any>(`/api/admin/broadcasts/${id}`).then((r) => {
      setB(r.broadcast);
      setCounts(r.counts);
      const a = r.broadcast.audience_filter || {};
      setAud({ ...emptyAudience, ...a, expiring_within_days: a.expiring_within_days ? String(a.expiring_within_days) : "" });
    });
  }, [id]);

  const audiencePayload = () => ({ ...aud, expiring_within_days: aud.expiring_within_days ? Number(aud.expiring_within_days) : null, sales_owner_id: aud.sales_owner_id || null });
  const editable = canSend && (b.status === "DRAFT" || b.status === "SCHEDULED");
  const previewHtml = (b.html_body || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m: string, k: string) => SAMPLE_VARS[k] ?? m);

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setError(null);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const save = async () => {
    const body = { subject: b.subject, type: b.type, html_body: b.html_body, audience_filter: audiencePayload() };
    if (savedId) {
      const r = await api<any>(`/api/admin/broadcasts/${savedId}`, { method: "PATCH", body });
      setB(r.broadcast);
      return savedId;
    }
    const r = await api<any>("/api/admin/broadcasts", { body });
    setSavedId(r.broadcast._id);
    setB(r.broadcast);
    return r.broadcast._id as string;
  };
  const toggle = (k: "statuses" | "sources", v: string) => setAud((a) => ({ ...a, [k]: a[k].includes(v) ? a[k].filter((x) => x !== v) : [...a[k], v] }));

  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3.5 w-3.5" /> Broadcasts</button>
      <PageHeader
        title={savedId ? b.subject || "Broadcast" : "New broadcast"}
        subtitle={savedId ? `Status: ${label(b.status)}${b.scheduled_at ? ` · scheduled ${dmy(b.scheduled_at, true)}` : ""}` : "HTML email to agency contacts (sent through SMTP, throttled)"}
        actions={
          <>
            {editable && <Button variant="outline" className="gap-1.5" disabled={!!busy} onClick={() => run("save", async () => { await save(); setMsg("Saved (HTML sanitized)."); })}><Save className="h-4 w-4" /> Save draft</Button>}
            {editable && <Button variant="outline" className="gap-1.5" disabled={!!busy || !b.subject} onClick={() => run("test", async () => { const sid = await save(); const r = await api<any>(`/api/admin/broadcasts/${sid}/test-send`, { body: {} }); setMsg(`Test sent to ${r.sent_to}`); })}><TestTube2 className="h-4 w-4" /> Send test to me</Button>}
            {canSend && savedId && ["SCHEDULED", "SENDING", "DRAFT"].includes(b.status) && (
              <Button variant="outline" className="gap-1.5 text-red-600" disabled={!!busy} onClick={() => run("cancel", async () => { if (!confirm("Cancel this broadcast? Remaining recipients will be skipped.")) return; const r = await api<any>(`/api/admin/broadcasts/${savedId}/cancel`, { body: {} }); setB(r.broadcast); })}><XCircle className="h-4 w-4" /> Cancel</Button>
            )}
            {canSend && savedId && counts.FAILED > 0 && <Button variant="outline" onClick={() => run("retry", async () => { const r = await api<any>(`/api/admin/broadcasts/${savedId}/retry-failed`, { body: {} }); setMsg(`${r.retried} recipients re-queued`); })}>Retry failed</Button>}
          </>
        }
      />
      {msg && <div className="mb-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-700 dark:text-emerald-400">{msg}</div>}
      <ErrorNote message={error} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-3">
        <Panel title="Message">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Subject" className="col-span-2"><Input disabled={!editable} value={b.subject} onChange={(e) => setB({ ...b, subject: e.target.value })} /></Field>
              <Field label="Type"><NativeSelect className="w-full" value={b.type} onChange={(v) => editable && setB({ ...b, type: v })} options={["PROMOTIONAL", "OPERATIONAL"]} /></Field>
            </div>
            {b.type === "PROMOTIONAL" ? (
              <p className="text-[12px] text-gray-500">Sent only to owners with marketing consent who have not unsubscribed. An unsubscribe footer is added automatically if <code>{"{{unsubscribe_url}}"}</code> is missing.</p>
            ) : (
              <p className="text-[12px] text-amber-600">Operational emails go to all matching owners regardless of consent. Policy: no promotional content (maintenance, price changes, policy, billing notices only).</p>
            )}
            <Field label="HTML body" hint={`Variables: {{agency_name}} {{owner_name}} {{expiry_date}} {{days_left}} {{unsubscribe_url}} · images must be absolute https URLs · max 200 KB`}>
              <Textarea disabled={!editable} value={b.html_body} onChange={(e) => setB({ ...b, html_body: e.target.value })} className="min-h-[320px] font-mono text-[12px]" />
            </Field>
          </div>
        </Panel>
        <Panel title="Live preview (sandboxed, scripts disabled)">
          <iframe title="preview" sandbox="" srcDoc={previewHtml} className="w-full h-[460px] rounded-lg border border-gray-200 dark:border-[#1e1e21] bg-white" />
        </Panel>
      </div>

      <Panel title="Audience" className="mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 py-2 text-[13px]">
          <div>
            <p className="text-[11px] font-semibold uppercase text-gray-400 mb-1">Status (empty = all live)</p>
            {["TRIAL", "ACTIVE", "EXPIRED", "SUSPENDED", "OFFBOARDED"].map((s) => (
              <label key={s} className="flex items-center gap-1.5"><input type="checkbox" disabled={!editable} checked={aud.statuses.includes(s)} onChange={() => toggle("statuses", s)} /> {label(s)}</label>
            ))}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase text-gray-400 mb-1">Source</p>
            {["PUBLIC_TRIAL", "PUBLIC_PURCHASE", "SALES_EXEC", "ADMIN_CREATED", "LEGACY"].map((s) => (
              <label key={s} className="flex items-center gap-1.5"><input type="checkbox" disabled={!editable} checked={aud.sources.includes(s)} onChange={() => toggle("sources", s)} /> {label(s)}</label>
            ))}
          </div>
          <div className="space-y-2">
            <Field label="Expiring within (days)"><Input type="number" disabled={!editable} value={aud.expiring_within_days} onChange={(e) => setAud({ ...aud, expiring_within_days: e.target.value })} /></Field>
            <Field label="Sales owner"><NativeSelect className="w-full" value={aud.sales_owner_id} onChange={(v) => editable && setAud({ ...aud, sales_owner_id: v })} placeholder="Any" options={(lookups.data?.sales_executives ?? []).map((s: any) => ({ value: s.id, label: s.name }))} /></Field>
          </div>
          <div className="space-y-2">
            <Field label="Created from"><Input type="date" disabled={!editable} value={aud.created_from ?? ""} onChange={(e) => setAud({ ...aud, created_from: e.target.value })} /></Field>
            <Field label="Created to"><Input type="date" disabled={!editable} value={aud.created_to ?? ""} onChange={(e) => setAud({ ...aud, created_to: e.target.value })} /></Field>
            <label className="flex items-center gap-1.5"><input type="checkbox" disabled={!editable} checked={aud.consent_only} onChange={(e) => setAud({ ...aud, consent_only: e.target.checked })} /> Consented only</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" disabled={!editable} checked={aud.trial_expired_never_paid} onChange={(e) => setAud({ ...aud, trial_expired_never_paid: e.target.checked })} /> Trial expired, never paid (win-back)</label>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-gray-100 dark:border-[#1e1e21] mt-2">
          <Button variant="outline" className="gap-1.5" disabled={!!busy} onClick={() => run("preview", async () => setPreview(await api("/api/admin/broadcasts/audience-preview", { body: { audience_filter: audiencePayload(), type: b.type } })))}>
            {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Preview audience
          </Button>
          {editable && (
            <>
              <Field label="Schedule (PKT, empty = send now)"><Input type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)} className="h-9" /></Field>
              <Button className="gap-1.5 bg-red-600 hover:bg-red-700 text-white" disabled={!!busy || !b.subject} onClick={() => run("send", async () => {
                const sid = await save();
                const p = await api<any>("/api/admin/broadcasts/audience-preview", { body: { audience_filter: audiencePayload(), type: b.type } });
                if (!confirm(`${schedule ? "Schedule" : "Send"} to ${p.eligible} recipients (${p.skipped} will be skipped)?`)) return;
                const r = await api<any>(`/api/admin/broadcasts/${sid}/send`, { body: { scheduled_at: fromPktInput(schedule) } });
                setB(r.broadcast);
                setMsg(schedule ? "Scheduled." : "Sending started — recipients are queued within a minute and sent within the throttle.");
              })}>
                <Send className="h-4 w-4" /> {schedule ? "Schedule" : "Send now"}
              </Button>
            </>
          )}
        </div>
        {preview && (
          <div className="mt-3 text-[13px]">
            <p><b>{preview.eligible}</b> will receive · {preview.skipped} skipped (no consent / unsubscribed / no email) · {preview.total} matching agencies</p>
            <p className="text-gray-500 text-[12px] mt-1">Sample: {preview.sample.map((s: any) => `${s.name} <${s.email}>`).join(", ") || "-"}</p>
          </div>
        )}
      </Panel>

      {savedId && b.status !== "DRAFT" && (
        <Panel title={`Recipients · ${Object.entries(counts).map(([k, v]) => `${label(k)} ${v}`).join(" · ")}`} className="mt-4">
          {recipients.loading && !recipients.data ? <Loading /> : (
            <>
              <DataTable empty={!recipients.data?.data.length} head={<><Th>Email</Th><Th>Status</Th><Th>Reason / error</Th></>}>
                {recipients.data?.data.map((r: any) => (
                  <tr key={r._id}><Td className="font-mono text-[12px]">{r.email}</Td><Td><StatusBadge status={r.status} /></Td><Td className="text-[12px]">{r.skip_reason ? label(r.skip_reason) : r.last_error ?? "-"}</Td></tr>
                ))}
              </DataTable>
              {recipients.data && <Pager page={recPage} pageSize={recipients.data.page_size} total={recipients.data.total} onPage={setRecPage} />}
            </>
          )}
        </Panel>
      )}
    </div>
  );
}

export default function BroadcastPage() {
  const can = useCan();
  const [editing, setEditing] = useState<string | null | "new">(null);
  const [page, setPage] = useState(1);
  const list = useApi<any>(editing ? null : `/api/admin/broadcasts${qs({ page })}`, []);

  if (editing) return <Composer id={editing === "new" ? null : editing} onBack={() => setEditing(null)} />;
  return (
    <div>
      <PageHeader
        title="Broadcast"
        subtitle="HTML email composer and bulk send"
        actions={can("broadcast.send") && <Button className="gap-1.5 bg-red-600 hover:bg-red-700 text-white" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New broadcast</Button>}
      />
      <Panel>
        <ErrorNote message={list.error} />
        {list.loading && !list.data ? <Loading /> : (
          <>
            <DataTable empty={!list.data?.data.length} head={<><Th>Subject</Th><Th>Type</Th><Th>Status</Th><Th>Recipients</Th><Th>Scheduled / started</Th><Th>Completed</Th><Th>By</Th></>}>
              {list.data?.data.map((b: any) => (
                <tr key={b._id} className="cursor-pointer hover:bg-gray-50/50 dark:hover:bg-[#151517]" onClick={() => setEditing(b._id)}>
                  <Td className="font-semibold">{b.subject}</Td>
                  <Td><StatusBadge status={b.type} /></Td>
                  <Td><StatusBadge status={b.status} /></Td>
                  <Td>{b.recipient_count || "-"}</Td>
                  <Td className="text-[12px]">{dmy(b.started_at || b.scheduled_at, true)}</Td>
                  <Td className="text-[12px]">{dmy(b.completed_at, true)}</Td>
                  <Td className="text-[12px]">{b.created_by_name ?? "-"}</Td>
                </tr>
              ))}
            </DataTable>
            {list.data && <Pager page={page} pageSize={list.data.page_size} total={list.data.total} onPage={setPage} />}
          </>
        )}
      </Panel>
    </div>
  );
}
