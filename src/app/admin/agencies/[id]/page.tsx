"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Ban, CalendarPlus, KeyRound, LogOut as Offboard, Pencil, Play, RotateCcw, ShoppingCart, SlidersHorizontal, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ActionDialog, Badge, DataTable, ErrorNote, LinkNotice, Loading, PageHeader, Panel, StatusBadge, Tabs, Td, Th, api, dmy, label, pkr, useApi, useCan, useMe,
} from "@/components/platform/kit";
import { notify } from "@/lib/notify";
import { AccessCell, AgencyRow, useAgencyActions } from "@/components/platform/agency-shared";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Detail {
  agency: AgencyRow & Record<string, any>;
  users: any[];
  periods: any[];
  orders: any[];
  receipts: any[];
  tickets: any[];
  timeline: any[];
  consent: any;
  archives: any[];
}

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{k}</p>
      <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 mt-0.5 break-words">{v || "-"}</p>
    </div>
  );
}

export default function AgencyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const me = useMe();
  const { data, loading, error, reload } = useApi<Detail>(`/api/admin/agencies/${id}`, [id]);
  const lookups = useApi<{ sales_executives: { id: string; name: string }[] }>("/api/admin/lookups");
  const actions = useAgencyActions(reload);
  const [tab, setTab] = useState("overview");
  const [link, setLink] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote message={error} />;
  if (!data) return null;
  const a = data.agency;
  const s = a.status;

  const editProfile = () =>
    actions.setSpec({
      title: "Edit profile",
      fields: [
        { name: "name", label: "Business name", required: true, defaultValue: a.name },
        { name: "owner_name", label: "Owner name", defaultValue: a.owner.name },
        { name: "owner_email", label: "Owner email", defaultValue: a.owner.email },
        { name: "owner_phone", label: "Owner phone", defaultValue: a.owner.phone },
        { name: "business_phone", label: "Business phone", defaultValue: a.business_phone },
        { name: "business_email", label: "Business email", defaultValue: a.business_email },
        { name: "business_address", label: "Business address", defaultValue: a.business_address },
        { name: "internal_note", label: "Internal note", type: "textarea", defaultValue: a.internal_note ?? "" },
      ],
      confirmLabel: "Save",
      run: (v) => api(`/api/admin/agencies/${id}`, { method: "PATCH", body: v }),
      onDone: reload,
    });
  const setLimits = () =>
    actions.setSpec({
      title: "Change limits (outside an order)",
      description: "Super Admin only — audit-logged. Seats cannot go below active users.",
      fields: [
        { name: "seats", label: "Seats", type: "number", defaultValue: String(a.seat_limit) },
        { name: "branches", label: "Branches", type: "number", defaultValue: String(a.branch_limit) },
        { name: "reason", label: "Reason", type: "textarea", required: true },
      ],
      confirmLabel: "Apply",
      run: (v) => api(`/api/admin/agencies/${id}/set-limits`, { body: { seats: Number(v.seats), branches: Number(v.branches), reason: v.reason } }),
      onDone: reload,
    });
  const assignOwner = () =>
    actions.setSpec({
      title: "Assign sales owner",
      description: "Open tickets are re-routed to the new owner.",
      fields: [
        { name: "sales_owner_id", label: "Sales Executive", type: "select", options: (lookups.data?.sales_executives ?? []).map((x) => ({ value: x.id, label: x.name })), defaultValue: a.sales_owner_id ?? "" },
        { name: "reason", label: "Reason", type: "textarea" },
      ],
      confirmLabel: "Assign",
      run: (v) => api(`/api/admin/agencies/${id}/assign-owner`, { body: v }),
      onDone: reload,
    });
  const restoreReadOnly = () =>
    actions.setSpec({
      title: "Restore read-only",
      description: "Moves OFFBOARDED → EXPIRED so the agency can sign in and export its data. Offboard again afterwards if needed.",
      fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }],
      confirmLabel: "Restore read-only",
      run: (v) => api(`/api/admin/agencies/${id}/restore-read-only`, { body: v }),
      onDone: reload,
    });
  const resendInvite = async () => {
    try {
      const r = await api<{ set_password_link: string }>(`/api/admin/agencies/${id}/resend-invite`, { body: {} });
      setLink(r.set_password_link);
      notify.success("Invite link regenerated");
    } catch (e) {
      notify.error("Failed to resend invite", e);
    }
  };

  return (
    <div>
      <Link href="/admin/agencies" className="inline-flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3.5 w-3.5" /> Agencies</Link>
      <PageHeader
        title={a.name}
        subtitle={`${label(a.source)} · created ${dmy(a.created_at)}${a.sales_owner_name ? ` · sales owner ${a.sales_owner_name}` : ""}`}
        actions={
          <>
            {can("orders.create") && ["TRIAL", "ACTIVE", "EXPIRED", "OFFBOARDED", "REJECTED"].includes(s) && (
              <Link href={`/admin/orders?new=${id}`}><Button variant="outline" className="gap-1.5"><ShoppingCart className="h-4 w-4" /> New order</Button></Link>
            )}
            {can("agencies.edit_profile") && <Button variant="outline" className="gap-1.5" onClick={editProfile}><Pencil className="h-4 w-4" /> Edit</Button>}
            {can("agencies.edit_profile") && data.users.some((u) => u.role === "Owner") && <Button variant="outline" className="gap-1.5" onClick={resendInvite}><KeyRound className="h-4 w-4" /> Owner password link</Button>}
            {can("agencies.set_limits") && <Button variant="outline" className="gap-1.5" onClick={setLimits}><SlidersHorizontal className="h-4 w-4" /> Limits</Button>}
            {can("agencies.assign_owner") && <Button variant="outline" className="gap-1.5" onClick={assignOwner}><UserCog className="h-4 w-4" /> Sales owner</Button>}
            {can("agencies.extend_complimentary") && ["TRIAL", "ACTIVE", "EXPIRED"].includes(s) && <Button variant="outline" className="gap-1.5" onClick={() => actions.extend(a)}><CalendarPlus className="h-4 w-4" /> Complimentary extension</Button>}
            {can("agencies.suspend") && ["TRIAL", "ACTIVE", "EXPIRED"].includes(s) && <Button variant="outline" className="gap-1.5 text-red-600" onClick={() => actions.suspend(a)}><Ban className="h-4 w-4" /> Suspend</Button>}
            {can("agencies.activate") && s === "SUSPENDED" && <Button variant="outline" className="gap-1.5 text-emerald-600" onClick={() => actions.activate(a)}><Play className="h-4 w-4" /> Activate</Button>}
            {can("agencies.offboard") && ["TRIAL", "ACTIVE", "EXPIRED", "SUSPENDED"].includes(s) && <Button variant="outline" className="gap-1.5" onClick={() => actions.offboard(a)}><Offboard className="h-4 w-4" /> Offboard</Button>}
            {can("agencies.offboard") && s === "OFFBOARDED" && <Button variant="outline" className="gap-1.5" onClick={restoreReadOnly}><RotateCcw className="h-4 w-4" /> Restore read-only</Button>}
          </>
        }
      />
      <LinkNotice link={link} onClose={() => setLink(null)} title="Owner set-password link" />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
        <Panel><p className="text-[11px] font-semibold uppercase text-gray-400 pt-3">Status</p><div className="mt-1"><StatusBadge status={s} /></div>{a.possible_duplicate && <Badge tone="amber">Possible duplicate</Badge>}</Panel>
        <Panel><p className="text-[11px] font-semibold uppercase text-gray-400 pt-3">Access</p><div className="mt-1"><AccessCell a={a} /></div></Panel>
        <Panel><p className="text-[11px] font-semibold uppercase text-gray-400 pt-3">Seats used / limit</p><p className="text-lg font-semibold">{a.user_count} / {a.seat_limit}</p></Panel>
        <Panel><p className="text-[11px] font-semibold uppercase text-gray-400 pt-3">Branches used / limit</p><p className="text-lg font-semibold">{a.branches_used} / {a.branch_limit}</p></Panel>
        <Panel><p className="text-[11px] font-semibold uppercase text-gray-400 pt-3">Marketing consent</p><p className="text-lg font-semibold">{data.consent?.unsubscribed_at ? "Unsubscribed" : a.marketing_consent ? "Yes" : "No"}</p></Panel>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "overview", label: "Profile" },
          { value: "periods", label: `Subscription (${data.periods.length})` },
          { value: "orders", label: `Orders (${data.orders.length})` },
          { value: "receipts", label: `Receipts (${data.receipts.length})` },
          { value: "tickets", label: `Tickets (${data.tickets.length})` },
          { value: "users", label: `Users (${data.users.length})` },
          { value: "timeline", label: "Timeline" },
        ]}
      />

      {tab === "overview" && (
        <Panel>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 py-3">
            <Info k="Owner" v={a.owner.name} />
            <Info k="Owner email" v={a.owner.email} />
            <Info k="Owner phone" v={a.owner.phone} />
            <Info k="Business phone" v={a.business_phone} />
            <Info k="Business email" v={a.business_email} />
            <Info k="Business address" v={a.business_address} />
            <Info k="Currency / prefix" v={`${a.base_currency} / ${a.invoice_prefix}`} />
            <Info k="Trial ends" v={dmy(a.trial_ends_at)} />
            <Info k="Referrer" v={a.referrer ? `${a.referrer.name} (${label(a.referrer.type)})` : "-"} />
            <Info k="Last active" v={dmy(a.last_active_at, true)} />
            {s === "SUSPENDED" && <Info k="Suspended" v={`${dmy(a.suspended_at)} — ${a.suspension_reason ?? ""} (resumes as ${label(a.resume_status)})`} />}
            {a.offboarded_at && <Info k="Offboarded" v={`${dmy(a.offboarded_at)} — ${label(a.offboard_reason)}${a.offboard_note ? `: ${a.offboard_note}` : ""}`} />}
            {a.retention_until && <Info k="Retention until" v={dmy(a.retention_until)} />}
            <Info k="Consent captured" v={data.consent ? `${dmy(data.consent.captured_at)} · data ${data.consent.data_consent ? "yes" : "no"} · marketing ${data.consent.marketing_consent ? "yes" : "no"}` : "-"} />
            <Info k="Internal note" v={a.internal_note} />
          </div>
          <p className="text-[11px] text-gray-400 pb-2">Account-level information only. Agency business data (customers, invoices, ledgers) is never visible to platform staff.</p>
        </Panel>
      )}

      {tab === "periods" && (
        <Panel>
          <DataTable empty={!data.periods.length} head={<><Th>Source</Th><Th>Start</Th><Th>End</Th><Th>Seats</Th><Th>Branches</Th><Th>Reason</Th><Th>State</Th></>}>
            {data.periods.map((p) => (
              <tr key={p._id}><Td>{label(p.source)}</Td><Td>{dmy(p.starts_at)}</Td><Td>{dmy(p.ends_at)}</Td><Td>{p.seats}</Td><Td>{p.branches}</Td><Td className="text-[12px]">{p.reason ?? "-"}</Td><Td>{p.voided_at ? <Badge tone="red">Voided</Badge> : p.limits_applied ? <Badge tone="green">Applied</Badge> : <Badge tone="blue">Starts later</Badge>}</Td></tr>
            ))}
          </DataTable>
        </Panel>
      )}

      {tab === "orders" && (
        <Panel>
          <DataTable empty={!data.orders.length} head={<><Th>Order</Th><Th>Type</Th><Th>Status</Th><Th>Plan</Th><Th className="text-right">Total</Th><Th>Created</Th></>}>
            {data.orders.map((o) => (
              <tr key={o._id}><Td><Link className="font-mono hover:underline" href={`/admin/orders/${o._id}`}>{o.order_number}</Link></Td><Td>{label(o.type)}</Td><Td><StatusBadge status={o.status} /></Td><Td>{o.seats} seats / {o.branches} br · {o.months ? `${o.months} mo` : "upgrade"}</Td><Td className="text-right font-mono">{pkr(o.total_due)}</Td><Td>{dmy(o.created_at)}</Td></tr>
            ))}
          </DataTable>
        </Panel>
      )}

      {tab === "receipts" && (
        <Panel>
          <DataTable empty={!data.receipts.length} head={<><Th>Receipt</Th><Th>Issued</Th><Th className="text-right">Total</Th><Th>State</Th><Th></Th></>}>
            {data.receipts.map((r) => (
              <tr key={r._id}><Td className="font-mono">{r.receipt_number}</Td><Td>{dmy(r.issued_at)}</Td><Td className="text-right font-mono">{pkr(r.total)}</Td><Td>{r.voided_at ? <Badge tone="red">Void</Badge> : <Badge tone="green">Valid</Badge>}</Td><Td><Link className="text-[12px] hover:underline" href={`/admin/orders/${r.order_id}/receipt`} target="_blank">Print</Link></Td></tr>
            ))}
          </DataTable>
        </Panel>
      )}

      {tab === "tickets" && (
        <Panel>
          <DataTable empty={!data.tickets.length} head={<><Th>Ticket</Th><Th>Subject</Th><Th>Category</Th><Th>Priority</Th><Th>Status</Th><Th>Last activity</Th></>}>
            {data.tickets.map((t) => (
              <tr key={t._id}><Td><Link className="font-mono hover:underline" href={`/admin/support?ticket=${t._id}`}>{t.ticket_number}</Link></Td><Td>{t.subject}</Td><Td>{label(t.category)}</Td><Td><StatusBadge status={t.priority} /></Td><Td><StatusBadge status={t.status} /></Td><Td>{dmy(t.last_message_at, true)}</Td></tr>
            ))}
          </DataTable>
        </Panel>
      )}

      {tab === "users" && (
        <Panel>
          <DataTable empty={!data.users.length} head={<><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Active</Th><Th>Last login</Th></>}>
            {data.users.map((u) => (
              <tr key={u._id}><Td>{u.name}</Td><Td className="font-mono text-[12px]">{u.email}</Td><Td>{u.role}</Td><Td>{u.is_active === false ? <Badge tone="gray">Inactive</Badge> : <Badge tone="green">Active</Badge>}</Td><Td>{dmy(u.last_login_at, true)}</Td></tr>
            ))}
          </DataTable>
        </Panel>
      )}

      {tab === "timeline" && (
        <Panel>
          {data.timeline.length === 0 ? (
            <p className="text-[13px] text-gray-400 py-6 text-center">No history yet.</p>
          ) : (
            <ol className="relative border-l border-gray-200 dark:border-[#1e1e21] ml-2 my-3 space-y-4">
              {data.timeline.map((e) => (
                <li key={e._id} className="ml-4">
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary/70" />
                  <p className="text-[13px] font-medium">{e.action} <span className="text-gray-400 font-normal">by {e.actor_name ?? label(e.actor_type)}</span></p>
                  <p className="text-[11px] text-gray-400">{dmy(e.occurred_at, true)}{e.reason ? ` · ${e.reason}` : ""}</p>
                </li>
              ))}
            </ol>
          )}
          {me?.permissions.includes("audit.read") && <Link className="text-[12px] hover:underline" href={`/admin/audit?agency_id=${id}`}>Open full audit log →</Link>}
        </Panel>
      )}

      <ActionDialog spec={actions.spec} onClose={() => actions.setSpec(null)} />
    </div>
  );
}
