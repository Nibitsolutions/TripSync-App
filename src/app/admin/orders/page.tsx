"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Download, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ActionDialog, ActionSpec, Badge, DataTable, ErrorNote, LinkNotice, Loading, NativeSelect, PageHeader, Pager, Panel, StatusBadge, Tabs, Td, Th,
  api, dmy, label, pkr, qs, useApi, useCan, useDebounced,
} from "@/components/platform/kit";
import { AccessCell, AgencyRow } from "@/components/platform/agency-shared";
import { NewOrderDialog } from "@/components/platform/order-form";

/* eslint-disable @typescript-eslint/no-explicit-any */

function OrdersInner() {
  const can = useCan();
  const router = useRouter();
  const sp = useSearchParams();
  const presetAgency = sp.get("new");
  const [tab, setTab] = useState("pending");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [f, setF] = useState({ type: "", status: "", payment_method: "", source: "", collected_by: "", from: "", to: "" });
  const [subView, setSubView] = useState("expiring");
  const [showNew, setShowNew] = useState(false);
  const [spec, setSpec] = useState<ActionSpec | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const q = useDebounced(search);

  useEffect(() => {
    if (presetAgency) setShowNew(true);
  }, [presetAgency]);

  const ordersUrl = tab === "subscriptions" ? null : `/api/admin/orders${qs({ page, page_size: 25, q, ...f, status: tab === "pending" ? "PENDING" : f.status || "ALL" })}`;
  const orders = useApi<{ data: any[]; total: number; page_size: number; pending: { count: number; total: number } }>(ordersUrl, []);
  const subs = useApi<{ data: AgencyRow[]; total: number; page_size: number }>(tab === "subscriptions" ? `/api/admin/subscriptions${qs({ view: subView, page })}` : null, []);
  const lookups = useApi<{ staff: { id: string; name: string }[] }>("/api/admin/lookups");

  const approve = (o: any) =>
    setSpec({
      title: `Approve ${o.order_number}`,
      description: (
        <div className="space-y-1">
          <p>{o.agency_name} · {label(o.type)} · <b>{pkr(o.total_due)}</b> ({o.payment_method === "CASH" ? "cash" : "bank transfer"}{o.collected_by_name ? `, collected by ${o.collected_by_name}` : ""})</p>
          <p>Reference <b className="font-mono">{o.payment_reference}</b> — verify the payment (WhatsApp screenshot / cash in hand) before approving.</p>
          <p className="text-gray-500">Approval extends access, issues the receipt, accrues commission and emails the customer — all in one transaction.</p>
        </div>
      ),
      confirmLabel: "Approve",
      run: () => api<any>(`/api/admin/orders/${o._id}/approve`, { body: {} }),
      onDone: (r: any) => { if (r?.set_password_link) setLink(r.set_password_link); orders.reload(); },
    });
  const reject = (o: any) =>
    setSpec({
      title: `Reject ${o.order_number}`,
      fields: [{ name: "reason", label: "Reason (sent to the customer)", type: "textarea", required: true }],
      danger: true,
      confirmLabel: "Reject",
      run: (v) => api(`/api/admin/orders/${o._id}/reject`, { body: v }),
      onDone: orders.reload,
    });

  const setFilter = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setPage(1); };

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="New purchases, conversions, renewals, upgrades and reactivations"
        actions={
          <>
            {tab !== "subscriptions" && (
              <a href={`/api/admin/orders${qs({ q, ...f, status: tab === "pending" ? "PENDING" : f.status || "ALL", format: "csv" })}`}>
                <Button variant="outline" className="gap-1.5"><Download className="h-4 w-4" /> Export</Button>
              </a>
            )}
            {can("orders.create") && <Button className="gap-1.5 bg-red-600 hover:bg-red-700 text-white" onClick={() => setShowNew(true)}><Plus className="h-4 w-4" /> Record order</Button>}
          </>
        }
      />
      <LinkNotice link={link} onClose={() => setLink(null)} title="New agency provisioned — owner set-password link" />

      <Tabs
        value={tab}
        onChange={(v) => { setTab(v); setPage(1); }}
        tabs={[
          { value: "pending", label: <>Pending approval {orders.data?.pending?.count ? <Badge tone="violet">{orders.data.pending.count}</Badge> : null}</> },
          { value: "all", label: "All orders" },
          { value: "subscriptions", label: "Subscriptions" },
        ]}
      />

      {tab !== "subscriptions" ? (
        <Panel>
          <div className="flex flex-wrap gap-2 py-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-gray-400" />
              <Input placeholder="Order #, reference, agency, code" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="h-9 pl-8 w-[240px]" />
            </div>
            <NativeSelect value={f.type} onChange={setFilter("type")} placeholder="All types" options={["NEW", "CONVERSION", "RENEWAL", "UPGRADE", "REACTIVATION"]} />
            {tab === "all" && <NativeSelect value={f.status} onChange={setFilter("status")} placeholder="All statuses" options={["PENDING", "APPROVED", "REJECTED", "REVERSED", "CANCELLED"]} />}
            <NativeSelect value={f.payment_method} onChange={setFilter("payment_method")} placeholder="Any method" options={[{ value: "CASH", label: "Cash" }, { value: "BANK_TRANSFER", label: "Bank transfer" }]} />
            <NativeSelect value={f.source} onChange={setFilter("source")} placeholder="Any source" options={["PUBLIC_FORM", "AGENCY_APP", "ADMIN_PANEL"]} />
            <NativeSelect value={f.collected_by} onChange={setFilter("collected_by")} placeholder="Any collector" options={(lookups.data?.staff ?? []).map((s) => ({ value: s.id, label: s.name }))} />
            <Input type="date" value={f.from} onChange={(e) => setFilter("from")(e.target.value)} className="h-9 w-[140px]" />
            <Input type="date" value={f.to} onChange={(e) => setFilter("to")(e.target.value)} className="h-9 w-[140px]" />
          </div>
          {tab === "pending" && orders.data && (
            <p className="text-[12px] text-gray-500 pb-2">{orders.data.pending.count} pending · {pkr(orders.data.pending.total)} awaiting verification · oldest first</p>
          )}
          <ErrorNote message={orders.error} />
          {orders.loading && !orders.data ? <Loading /> : (
            <>
              <DataTable
                empty={!orders.data?.data.length}
                head={<><Th>Order</Th><Th>Agency</Th><Th>Type</Th><Th>Status</Th><Th>Plan</Th><Th className="text-right">Total</Th><Th>Payment</Th><Th>Age</Th><Th>Actions</Th></>}
              >
                {orders.data?.data.map((o) => (
                  <tr key={o._id} className="hover:bg-gray-50/50 dark:hover:bg-[#151517]">
                    <Td>
                      <Link href={`/admin/orders/${o._id}`} className="font-mono font-semibold hover:underline">{o.order_number}</Link>
                      <p className="text-[11px] text-gray-400 font-mono">{o.payment_reference}</p>
                    </Td>
                    <Td>
                      <Link href={`/admin/agencies/${o.agency_id}`} className="hover:underline">{o.agency_name}</Link>
                      {o.possible_duplicate && <p className="text-[10px] text-amber-600 font-semibold">Possible duplicate</p>}
                    </Td>
                    <Td className="text-[12px]">{label(o.type)}<p className="text-[11px] text-gray-400">{label(o.source)}</p></Td>
                    <Td><StatusBadge status={o.status} />{o.receipt_email_status === "FAILED" && <p className="text-[10px] text-red-600 font-semibold mt-1">Receipt email failed</p>}</Td>
                    <Td className="text-[12px] whitespace-nowrap">{o.seats} seats / {o.branches} br<p className="text-gray-400">{o.months ? `${o.months} months` : `upgrade · ${o.remaining_days}d`}</p></Td>
                    <Td className="text-right font-mono">{pkr(o.total_due)}{o.promo_code && <p className="text-[11px] text-gray-400">{o.promo_code}</p>}</Td>
                    <Td className="text-[12px]">{o.payment_method === "CASH" ? "Cash" : "Bank"}{o.collected_by_name && <p className="text-gray-400">by {o.collected_by_name}</p>}</Td>
                    <Td className="text-[12px] whitespace-nowrap">{o.age_days}d{o.stale && <p className="text-[10px] text-amber-600 font-semibold">&gt;14 days</p>}<p className="text-gray-400">{dmy(o.created_at)}</p></Td>
                    <Td>
                      <div className="flex gap-1">
                        {o.status === "PENDING" && can("orders.approve") && <Button size="sm" className="h-7 gap-1 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => approve(o)}><Check className="h-3 w-3" /> Approve</Button>}
                        {o.status === "PENDING" && can("orders.reject") && <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px] text-red-600" onClick={() => reject(o)}><X className="h-3 w-3" /> Reject</Button>}
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => router.push(`/admin/orders/${o._id}`)}>Open</Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </DataTable>
              {orders.data && <Pager page={page} pageSize={orders.data.page_size} total={orders.data.total} onPage={setPage} />}
            </>
          )}
        </Panel>
      ) : (
        <Panel>
          <div className="flex flex-wrap gap-1 py-2">
            {[
              ["expiring", "Expiring ≤ 30 days"],
              ["trial_ending", "Trial ending ≤ 2 days"],
              ["expired", "Expired"],
              ["suspended", "Suspended"],
              ["offboarded", "Offboarded"],
              ["all", "All live"],
            ].map(([v, l]) => (
              <Button key={v} size="sm" variant={subView === v ? "default" : "outline"} className="h-8 text-[12px]" onClick={() => { setSubView(v); setPage(1); }}>{l}</Button>
            ))}
          </div>
          <ErrorNote message={subs.error} />
          {subs.loading && !subs.data ? <Loading /> : (
            <>
              <DataTable empty={!subs.data?.data.length} head={<><Th>Agency</Th><Th>Owner</Th><Th>Status</Th><Th>Access</Th><Th>Plan</Th><Th>Sales owner</Th><Th>Actions</Th></>}>
                {subs.data?.data.map((a) => (
                  <tr key={a._id}>
                    <Td><Link href={`/admin/agencies/${a._id}`} className="font-semibold hover:underline">{a.name}</Link></Td>
                    <Td>{a.owner.name}<p className="text-[11px] text-gray-400">{a.owner.phone || a.owner.email}</p></Td>
                    <Td><StatusBadge status={a.status} /></Td>
                    <Td><AccessCell a={a} /></Td>
                    <Td className="text-[12px]">{a.seat_limit} seats / {a.branch_limit} br</Td>
                    <Td className="text-[12px]">{a.sales_owner_name ?? "-"}</Td>
                    <Td>{can("orders.create") && !["SUSPENDED"].includes(a.status) && <Link href={`/admin/orders?new=${a._id}`}><Button size="sm" variant="outline" className="h-7 text-[11px]">Renew</Button></Link>}</Td>
                  </tr>
                ))}
              </DataTable>
              {subs.data && <Pager page={page} pageSize={subs.data.page_size} total={subs.data.total} onPage={setPage} />}
            </>
          )}
        </Panel>
      )}

      <NewOrderDialog
        open={showNew}
        presetAgencyId={presetAgency}
        onClose={() => { setShowNew(false); if (presetAgency) router.replace("/admin/orders"); }}
        onCreated={(r: any) => { if (r?.set_password_link) setLink(r.set_password_link); setTab(r?.order?.status === "APPROVED" ? "all" : "pending"); orders.reload(); }}
      />
      <ActionDialog spec={spec} onClose={() => setSpec(null)} />
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <OrdersInner />
    </Suspense>
  );
}
