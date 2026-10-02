"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, Mail, Printer, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ActionDialog, ActionSpec, Badge, DataTable, ErrorNote, LinkNotice, Loading, PageHeader, Panel, StatusBadge, Td, Th, api, dmy, label, pkr, useApi, useCan,
} from "@/components/platform/kit";
import { QuoteBreakdown } from "@/components/platform/order-form";

/* eslint-disable @typescript-eslint/no-explicit-any */
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-[13px] border-b border-gray-50 dark:border-[#18181b] last:border-0">
      <span className="text-gray-500">{k}</span>
      <span className="text-right font-medium">{v ?? "-"}</span>
    </div>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const { data, loading, error, reload } = useApi<any>(`/api/admin/orders/${id}`, [id]);
  const [spec, setSpec] = useState<ActionSpec | null>(null);
  const [link, setLink] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote message={error} />;
  if (!data) return null;
  const o = data.order;

  const act = (action: string, title: string, opts: Partial<ActionSpec> = {}) =>
    setSpec({
      title,
      confirmLabel: title,
      run: (v) => api<any>(`/api/admin/orders/${id}/${action}`, { body: v }),
      onDone: (r: any) => { if (r?.set_password_link) setLink(r.set_password_link); reload(); },
      ...opts,
    });

  return (
    <div>
      <Link href="/admin/orders" className="inline-flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3.5 w-3.5" /> Orders</Link>
      <PageHeader
        title={`Order ${o.order_number}`}
        subtitle={`${label(o.type)} · ${label(o.source)} · created ${dmy(o.created_at, true)}`}
        actions={
          <>
            {o.status === "PENDING" && can("orders.approve") && <Button className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => act("approve", "Approve", { description: `Verify payment reference ${o.payment_reference} (${pkr(o.total_due)}) before approving.` })}><Check className="h-4 w-4" /> Approve</Button>}
            {o.status === "PENDING" && can("orders.reject") && <Button variant="outline" className="gap-1.5 text-red-600" onClick={() => act("reject", "Reject", { danger: true, fields: [{ name: "reason", label: "Reason (sent to customer)", type: "textarea", required: true }] })}><X className="h-4 w-4" /> Reject</Button>}
            {o.status === "PENDING" && can("orders.create") && <Button variant="outline" onClick={() => act("cancel", "Cancel order", { danger: true, description: "Cancels the pending order and releases its promo redemption." })}>Cancel</Button>}
            {o.status === "APPROVED" && can("orders.approve") && <Button variant="outline" className="gap-1.5" onClick={() => act("resend-receipt", "Resend receipt")}><Mail className="h-4 w-4" /> Resend receipt</Button>}
            {o.status === "APPROVED" && can("orders.reverse") && <Button variant="outline" className="gap-1.5 text-red-600" onClick={() => act("reverse", "Reverse order", { danger: true, description: "Voids the receipt (number retained), removes the subscription period, recomputes expiry and writes negative commission entries. Nothing is deleted.", fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }] })}><Undo2 className="h-4 w-4" /> Reverse</Button>}
            {data.receipt && <Link href={`/admin/orders/${id}/receipt`} target="_blank"><Button variant="outline" className="gap-1.5"><Printer className="h-4 w-4" /> Receipt</Button></Link>}
          </>
        }
      />
      <LinkNotice link={link} onClose={() => setLink(null)} title="Owner set-password link" />
      {o.receipt_email_status === "FAILED" && <div className="mb-4"><ErrorNote message="Receipt email failed — use Resend receipt (check SMTP settings)." /></div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Status & payment">
          <Row k="Status" v={<StatusBadge status={o.status} />} />
          <Row k="Payment reference" v={<span className="font-mono">{o.payment_reference}</span>} />
          <Row k="Method" v={o.payment_method === "CASH" ? "Cash" : "Bank transfer / QR"} />
          <Row k="Amount received" v={pkr(o.amount_received)} />
          {o.amount_override_reason && <Row k="Override reason" v={o.amount_override_reason} />}
          <Row k="Collected by" v={o.collected_by_name} />
          <Row k="Collected on" v={dmy(o.collected_at)} />
          <Row k="Submitted by" v={o.submitted_by_name ?? label(o.source)} />
          {o.payment_note && <Row k="Note" v={o.payment_note} />}
          {o.approved_at && <Row k="Approved" v={`${dmy(o.approved_at, true)} by ${o.approved_by_name ?? "system"}`} />}
          {o.rejected_at && <Row k="Rejected" v={`${dmy(o.rejected_at, true)} — ${o.reject_reason}`} />}
          {o.reversed_at && <Row k="Reversed" v={`${dmy(o.reversed_at, true)} — ${o.reverse_reason}`} />}
          <Row k="Receipt email" v={o.receipt_email_status ? <StatusBadge status={o.receipt_email_status} /> : "-"} />
        </Panel>
        <Panel title="Price snapshot (honoured at approval)">
          <QuoteBreakdown quote={{ type: o.type, lines: o.lines, total_due: o.total_due, promo_error: null, months: o.months, remaining_days: o.remaining_days }} />
          <div className="mt-3">
            <Row k="Price book" v={data.price_book?.name} />
            <Row k="Monthly price" v={pkr(o.monthly_price)} />
            {o.campaign_name && <Row k="Campaign" v={`${o.campaign_name} (−${pkr(o.campaign_discount)})`} />}
            {o.promo_code && <Row k="Promo" v={`${o.promo_code} (−${pkr(o.promo_discount)})`} />}
            {o.manual_adjustment ? <Row k="Adjustment" v={`${pkr(o.manual_adjustment)} — ${o.adjustment_reason}`} /> : null}
          </div>
        </Panel>
        <Panel title="Agency">
          {data.agency ? (
            <>
              <Row k="Agency" v={<Link className="hover:underline" href={`/admin/agencies/${o.agency_id}`}>{data.agency.name}</Link>} />
              <Row k="Status" v={<StatusBadge status={data.agency.status} />} />
              <Row k="Owner" v={data.agency.owner_name} />
              <Row k="Email" v={data.agency.owner_email} />
              <Row k="Phone" v={data.agency.owner_phone} />
              <Row k="Expires" v={dmy(data.agency.access_expires_at)} />
              <Row k="Limits" v={`${data.agency.max_users} seats / ${data.agency.branch_limit ?? 1} br`} />
              {o.possible_duplicate && <Badge tone="amber">Possible duplicate — check before approving</Badge>}
            </>
          ) : "-"}
          {data.period && (
            <div className="mt-3">
              <Row k="Period" v={`${dmy(data.period.starts_at)} → ${dmy(data.period.ends_at)}`} />
              {data.period.voided_at && <Badge tone="red">Period voided</Badge>}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Panel title="Commission">
          <DataTable empty={!data.commissions.length} head={<><Th>Earner</Th><Th>Kind</Th><Th>Rate</Th><Th className="text-right">Amount</Th><Th>Status</Th></>}>
            {data.commissions.map((c: any) => (
              <tr key={c._id}><Td>{c.earner_name}</Td><Td>{label(c.kind)}</Td><Td>{c.rate_percent}%</Td><Td className="text-right font-mono">{pkr(c.amount)}</Td><Td><StatusBadge status={c.status} /></Td></tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title="Emails">
          <DataTable empty={!data.emails.length} head={<><Th>Subject</Th><Th>Status</Th><Th>Attempts</Th><Th>Sent</Th></>}>
            {data.emails.map((e: any) => (
              <tr key={e._id}><Td className="text-[12px]">{e.subject}<p className="text-gray-400">{e.to_email}</p>{e.last_error && <p className="text-red-600 text-[11px]">{e.last_error}</p>}</Td><Td><StatusBadge status={e.status} /></Td><Td>{e.attempts}</Td><Td className="text-[12px]">{dmy(e.sent_at, true)}</Td></tr>
            ))}
          </DataTable>
        </Panel>
      </div>
      <ActionDialog spec={spec} onClose={() => setSpec(null)} />
    </div>
  );
}
