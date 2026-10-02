"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorNote, Field, Loading, NativeSelect, PageHeader, Panel, StatusBadge, api, ago, dmy } from "@/components/platform/kit";

/* eslint-disable @typescript-eslint/no-explicit-any */
const CATEGORIES = ["BILLING", "TECHNICAL", "HOW_TO", "FEATURE_REQUEST", "ACCOUNT", "OTHER"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

function Chat({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [data, setData] = useState<any>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    try {
      setData(await api(`/api/tenant/support/tickets/${id}`));
      api(`/api/tenant/support/tickets/${id}/read`, { body: {} }).then(onChanged).catch(() => {});
    } catch (e) {
      setErr((e as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    setData(null);
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 30_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [data?.messages?.length]);

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/tenant/support/tickets/${id}/messages`, { body: { body } });
      setBody("");
      await load();
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function act(a: "resolve" | "close") {
    await api(`/api/tenant/support/tickets/${id}/${a}`, { body: {} }).catch((e) => setErr(e.message));
    await load();
    onChanged();
  }

  if (!data) return <Loading />;
  const t = data.ticket;
  return (
    <div className="flex flex-col h-[calc(100vh-240px)] min-h-[440px]">
      <div className="flex items-start justify-between gap-2 border-b border-gray-100 dark:border-[#1e1e21] pb-3">
        <div>
          <p className="text-[12px] text-gray-400 font-mono">{t.ticket_number}</p>
          <h2 className="text-[15px] font-semibold">{t.subject}</h2>
          <div className="flex gap-1 mt-1"><StatusBadge status={t.status} /><StatusBadge status={t.priority} /></div>
        </div>
        {t.status !== "CLOSED" && (
          <div className="flex gap-1">
            {t.status !== "RESOLVED" && <Button size="sm" variant="outline" onClick={() => act("resolve")}>Mark resolved</Button>}
            <Button size="sm" variant="outline" onClick={() => act("close")}>Close</Button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-3 space-y-3">
        {data.messages.map((m: any) => {
          const mine = m.sender_type === "AGENCY_USER";
          return (
            <div key={m._id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-xl px-3 py-2 text-[13px] whitespace-pre-wrap ${mine ? "bg-primary text-primary-foreground" : "bg-gray-100 dark:bg-[#1a1a1d]"}`}>
                <p className={`text-[11px] mb-0.5 ${mine ? "opacity-80" : "text-gray-500"}`}>{mine ? m.sender_name : `TripSync support · ${m.sender_name}`} · {dmy(m.created_at, true)}</p>
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <ErrorNote message={err} />
      {t.status !== "CLOSED" ? (
        <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-[#1e1e21]">
          <Textarea value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} placeholder="Write a message…" className="min-h-[60px]" />
          <Button onClick={send} disabled={busy || !body.trim()} className="self-end gap-1.5">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send</Button>
        </div>
      ) : (
        <p className="text-[12px] text-gray-400 pt-2">This ticket is closed. Open a new ticket if you need more help.</p>
      )}
    </div>
  );
}

export default function TenantSupportPage() {
  const [list, setList] = useState<any[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ subject: "", category: "HOW_TO", priority: "NORMAL", body: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ data: any[] }>("/api/tenant/support/tickets").then((r) => setList(r.data)).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<any>("/api/tenant/support/tickets", { body: form });
      setForm({ subject: "", category: "HOW_TO", priority: "NORMAL", body: "" });
      setCreating(false);
      load();
      setSelected(r.ticket._id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Support" subtitle="Chat with the TripSync team" actions={<Button className="gap-1.5" onClick={() => { setCreating(true); setSelected(null); }}><Plus className="h-4 w-4" /> New ticket</Button>} />
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        <Panel>
          {!list ? <Loading /> : list.length === 0 ? <p className="text-[13px] text-gray-400 py-8 text-center">No tickets yet.</p> : (
            <div className="divide-y divide-gray-100 dark:divide-[#1e1e21] -mx-2 pt-2">
              {list.map((t) => (
                <button key={t._id} onClick={() => { setSelected(t._id); setCreating(false); }} className={`w-full text-left px-2 py-2.5 hover:bg-gray-50 dark:hover:bg-[#151517] ${selected === t._id ? "bg-gray-50 dark:bg-[#151517]" : ""}`}>
                  <div className="flex items-center gap-2">
                    {t.unread && <span className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0" />}
                    <p className={`text-[13px] truncate ${t.unread ? "font-semibold" : ""}`}>{t.subject}</p>
                    <span className="ml-auto text-[11px] text-gray-400 whitespace-nowrap">{ago(t.last_message_at)}</span>
                  </div>
                  <div className="flex gap-1 mt-1"><span className="text-[11px] text-gray-400 font-mono mr-1">{t.ticket_number}</span><StatusBadge status={t.status} /></div>
                </button>
              ))}
            </div>
          )}
        </Panel>
        <Panel>
          {creating ? (
            <div className="space-y-3 py-3 max-w-xl">
              <Field label="Subject"><Input value={form.subject} maxLength={200} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Category"><NativeSelect className="w-full" value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={CATEGORIES} /></Field>
                <Field label="Priority"><NativeSelect className="w-full" value={form.priority} onChange={(v) => setForm({ ...form, priority: v })} options={PRIORITIES} /></Field>
              </div>
              <Field label="Message" hint="Plain text, up to 4,000 characters. Attachments are not supported — describe the issue or share screenshots on WhatsApp."><Textarea value={form.body} maxLength={4000} onChange={(e) => setForm({ ...form, body: e.target.value })} className="min-h-[140px]" /></Field>
              <ErrorNote message={err} />
              <Button onClick={create} disabled={busy || !form.subject.trim() || !form.body.trim()}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Create ticket</Button>
            </div>
          ) : selected ? (
            <Chat id={selected} onChanged={load} />
          ) : (
            <p className="text-[13px] text-gray-400 py-20 text-center">Select a ticket or create a new one.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
