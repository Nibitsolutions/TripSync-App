"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorNote, Loading, NativeSelect, PageHeader, Panel, StatusBadge, api, ago, dmy, label, qs, useCan, useDebounced, useMe } from "@/components/platform/kit";

/* eslint-disable @typescript-eslint/no-explicit-any */
const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"];
const CATEGORIES = ["BILLING", "TECHNICAL", "HOW_TO", "FEATURE_REQUEST", "ACCOUNT", "OTHER"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

function Thread({ id, onChanged }: { id: string; onChanged: () => void }) {
  const can = useCan();
  const [data, setData] = useState<any>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<any[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<any>(`/api/admin/tickets/${id}`);
      setData(r);
      api(`/api/admin/tickets/${id}/read`, { body: {} }).catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    setData(null);
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (can("support.reassign")) api<any>("/api/admin/lookups").then((r) => setStaff(r.staff.filter((s: any) => s.is_active))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [data?.messages?.length]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/tickets/${id}/messages`, { body: { body } });
      setBody("");
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function patch(change: Record<string, unknown>) {
    try {
      await api(`/api/admin/tickets/${id}`, { method: "PATCH", body: change });
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!data) return <Loading />;
  const t = data.ticket;
  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[480px]">
      <div className="border-b border-gray-100 dark:border-[#1e1e21] pb-3">
        <p className="text-[12px] text-gray-400 font-mono">{t.ticket_number}</p>
        <h2 className="text-[15px] font-semibold">{t.subject}</h2>
        <p className="text-[12px] text-gray-500">
          <Link href={`/admin/agencies/${t.agency_id}`} className="hover:underline">{data.agency?.name}</Link> · {data.agency?.owner_name} · {data.agency?.owner_phone || data.agency?.owner_email} · opened {dmy(t.created_at, true)}
        </p>
        {can("support.reply") && (
          <div className="flex flex-wrap gap-2 mt-2">
            <NativeSelect value={t.status} onChange={(v) => patch({ status: v })} options={STATUSES} />
            <NativeSelect value={t.priority} onChange={(v) => patch({ priority: v })} options={PRIORITIES} />
            <NativeSelect value={t.category} onChange={(v) => patch({ category: v })} options={CATEGORIES} />
            {can("support.reassign") && (
              <NativeSelect value={t.assigned_to_platform_user_id ?? ""} onChange={(v) => patch({ assigned_to: v || null })} placeholder="Unassigned" options={staff.map((s) => ({ value: s.id, label: s.name }))} />
            )}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-3 space-y-3">
        {data.messages.map((m: any) => {
          const mine = m.sender_type === "PLATFORM_USER";
          return (
            <div key={m._id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-xl px-3 py-2 text-[13px] whitespace-pre-wrap ${mine ? "bg-primary text-primary-foreground" : "bg-gray-100 dark:bg-[#1a1a1d]"}`}>
                <p className={`text-[11px] mb-0.5 ${mine ? "opacity-80" : "text-gray-500"}`}>{m.sender_name || label(m.sender_type)} · {dmy(m.created_at, true)}</p>
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <ErrorNote message={error} />
      {can("support.reply") && t.status !== "CLOSED" ? (
        <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-[#1e1e21]">
          <Textarea value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} placeholder="Reply (plain text, visible to the agency)…" className="min-h-[60px]" onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && body.trim()) send(); }} />
          <Button onClick={send} disabled={busy || !body.trim()} className="self-end gap-1.5">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send</Button>
        </div>
      ) : t.status === "CLOSED" ? <p className="text-[12px] text-gray-400 pt-2">Ticket closed.</p> : null}
    </div>
  );
}

function SupportInner() {
  const me = useMe();
  const sp = useSearchParams();
  const [selected, setSelected] = useState<string | null>(sp.get("ticket"));
  const [f, setF] = useState({ status: "open_all", category: "", priority: "", assignee: "", unread: "", q: "" });
  const q = useDebounced(f.q);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/admin/tickets${qs({ ...f, q, page_size: 50 })}`;

  const load = useCallback(() => {
    api<any>(url).then((r) => { setData(r); setError(null); }).catch((e) => setError(e.message));
  }, [url]);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div>
      <PageHeader title="Support" subtitle="Ticket inbox with two-way chat — refreshes every 20 seconds" />
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        <Panel>
          <div className="flex flex-wrap gap-2 py-2">
            <Input placeholder="Search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} className="h-9 w-full" />
            <NativeSelect value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[{ value: "open_all", label: "Open (all active)" }, { value: "", label: "Any status" }, ...STATUSES.map((s) => ({ value: s, label: label(s) }))]} />
            {me?.user.role !== "SalesExecutive" && (
              <NativeSelect value={f.assignee} onChange={(v) => setF({ ...f, assignee: v })} placeholder="Anyone" options={[{ value: "me", label: "Assigned to me" }, { value: "unassigned", label: "Unassigned" }]} />
            )}
            <NativeSelect value={f.category} onChange={(v) => setF({ ...f, category: v })} placeholder="Any category" options={CATEGORIES} />
            <NativeSelect value={f.priority} onChange={(v) => setF({ ...f, priority: v })} placeholder="Any priority" options={PRIORITIES} />
            <label className="flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={f.unread === "1"} onChange={(e) => setF({ ...f, unread: e.target.checked ? "1" : "" })} /> Unread</label>
          </div>
          <ErrorNote message={error} />
          {!data ? <Loading /> : data.data.length === 0 ? <p className="text-[13px] text-gray-400 py-8 text-center">No tickets.</p> : (
            <div className="divide-y divide-gray-100 dark:divide-[#1e1e21] max-h-[calc(100vh-320px)] overflow-y-auto -mx-2">
              {data.data.map((t: any) => (
                <button key={t._id} onClick={() => setSelected(t._id)} className={`w-full text-left px-2 py-2.5 hover:bg-gray-50 dark:hover:bg-[#151517] ${selected === t._id ? "bg-gray-50 dark:bg-[#151517]" : ""}`}>
                  <div className="flex items-center gap-2">
                    {t.unread && <span className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0" />}
                    <p className={`text-[13px] truncate ${t.unread ? "font-semibold" : ""}`}>{t.subject}</p>
                    <span className="ml-auto text-[11px] text-gray-400 whitespace-nowrap">{ago(t.last_message_at)}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 truncate">{t.ticket_number} · {t.agency_name} · {t.assignee_name ?? "Unassigned"}</p>
                  <div className="flex gap-1 mt-1"><StatusBadge status={t.status} /><StatusBadge status={t.priority} />{t.waiting_since && <span className="text-[10px] text-amber-600">waiting {ago(t.waiting_since)}</span>}</div>
                </button>
              ))}
            </div>
          )}
        </Panel>
        <Panel>{selected ? <Thread id={selected} onChanged={load} /> : <p className="text-[13px] text-gray-400 py-20 text-center">Select a ticket.</p>}</Panel>
      </div>
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SupportInner />
    </Suspense>
  );
}
