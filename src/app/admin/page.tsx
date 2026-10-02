"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Loading, ErrorNote, PageHeader, Panel, Stat, Td, Th, label, pkr, qs, useApi, useMe } from "@/components/platform/kit";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Summary = any;

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function OverviewPage() {
  const me = useMe();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const { data, loading, error } = useApi<{ scope: "all" | "own"; summary: Summary }>(`/api/admin/overview${qs({ from, to })}`, []);

  const rangeControls = (
    <div className="flex items-center gap-2">
      <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" />
      <span className="text-gray-400 text-sm">to</span>
      <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" />
      {data?.scope === "all" && (
        <a href={`/api/admin/overview${qs({ from, to, format: "csv" })}`}>
          <Button variant="outline" size="sm" className="h-9 gap-1.5">
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </a>
      )}
    </div>
  );

  if (loading && !data) return <><PageHeader title="Overview" actions={rangeControls} /><Loading /></>;
  if (error) return <><PageHeader title="Overview" actions={rangeControls} /><ErrorNote message={error} /></>;
  if (!data) return null;
  const s = data.summary;

  if (data.scope === "own") {
    return (
      <div>
        <PageHeader title={`Welcome, ${me?.user.name ?? ""}`} subtitle="Your agencies, orders and commissions" actions={rangeControls} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Stat title="Agencies onboarded" value={s.agencies_onboarded} hint={`${s.agencies_total} total`} />
          <Stat title="Pending orders" value={s.pending_orders.count} hint={pkr(s.pending_orders.total)} tone="amber" />
          <Stat title="Approved orders" value={s.approved_orders.count} hint={pkr(s.approved_orders.total)} tone="green" />
          <Stat title="Your cash pending approval" value={pkr(s.own_pending_cash.total)} hint={`${s.own_pending_cash.count} orders`} tone="amber" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title="Your agencies by status">
            <div className="flex flex-wrap gap-3">
              {Object.entries(s.status_counts as Record<string, number>).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-gray-100 dark:border-[#1e1e21] px-3 py-2">
                  <p className="text-[11px] text-gray-400 uppercase">{label(k)}</p>
                  <p className="text-lg font-semibold">{v}</p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Code redemptions & commission">
            {s.code_redemptions.length === 0 ? <p className="text-[13px] text-gray-400">No code redemptions yet.</p> : s.code_redemptions.map((c: any) => <p key={c.code} className="text-[13px]">{c.code}: <b>{c.count}</b></p>)}
            <p className="text-[13px] mt-3">Commission accrued (unpaid): <b>{pkr(s.commission.ACCRUED ?? 0)}</b> · Paid: <b>{pkr(s.commission.PAID ?? 0)}</b></p>
          </Panel>
        </div>
      </div>
    );
  }

  const sc = s.status_counts as Record<string, number>;
  const maxDay = Math.max(1, ...s.revenue_series.map((r: any) => r.total));

  return (
    <div>
      <PageHeader title="Overview" subtitle="Aggregate business numbers — no agency business data" actions={rangeControls} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Stat title="Revenue collected" value={pkr(s.revenue_collected)} hint={`${s.orders_approved} approved orders`} tone="green" />
        <Stat title="Cash pending approval" value={pkr(s.cash_pending.total)} hint={`${s.cash_pending.count} pending orders`} tone="amber" />
        <Stat title="Costs (incl. payouts)" value={pkr(s.costs.total)} />
        <Stat title="Net" value={pkr(s.net)} tone={s.net >= 0 ? "green" : "red"} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Stat title="Recurring run-rate / month" value={pkr(s.recurring_run_rate)} />
        <Stat title="Trials started / converted" value={`${s.trials.started} / ${s.trials.converted}`} hint={`${(s.trials.conversion_rate * 100).toFixed(1)}% conversion`} />
        <Stat title="New agencies" value={s.new_agencies.total} hint={Object.entries(s.new_agencies.by_source).map(([k, v]) => `${label(k)}: ${v}`).join(" · ") || "—"} />
        <Stat title="Churn (30d no renewal)" value={s.churn} tone={s.churn ? "red" : undefined} />
      </div>
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {["ACTIVE", "TRIAL", "EXPIRED", "SUSPENDED", "OFFBOARDED", "PENDING"].map((k) => (
          <Stat key={k} title={label(k)} value={sc[k] ?? 0} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Panel title="Revenue by day" className="lg:col-span-2">
          {s.revenue_series.length === 0 ? (
            <p className="text-[13px] text-gray-400 py-8 text-center">No approved orders in this range.</p>
          ) : (
            <div className="flex items-end gap-1 h-40 pt-2">
              {s.revenue_series.map((r: any) => (
                <div key={r.date} className="flex-1 flex flex-col items-center justify-end h-full group relative" title={`${r.date}: ${pkr(r.total)} (${r.count})`}>
                  <div className="w-full rounded-t bg-primary/80 group-hover:bg-primary" style={{ height: `${Math.max(3, (r.total / maxDay) * 100)}%` }} />
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Expiring soon">
          <div className="space-y-2 text-[13px]">
            <p className="flex justify-between"><span>Within 7 days</span><b>{s.expiring.d7}</b></p>
            <p className="flex justify-between"><span>Within 14 days</span><b>{s.expiring.d14}</b></p>
            <p className="flex justify-between"><span>Within 30 days</span><b>{s.expiring.d30}</b></p>
            <hr className="border-gray-100 dark:border-[#1e1e21]" />
            <p className="flex justify-between"><span>Discounts given</span><b>{pkr(s.discounts.total)}</b></p>
            <p className="flex justify-between text-gray-500"><span>· Campaigns</span><span>{pkr(s.discounts.campaign)}</span></p>
            <p className="flex justify-between text-gray-500"><span>· Promo codes</span><span>{pkr(s.discounts.promo)}</span></p>
            <hr className="border-gray-100 dark:border-[#1e1e21]" />
            <p className="flex justify-between"><span>Commission accrued</span><b>{pkr(s.commissions.accrued)}</b></p>
            <p className="flex justify-between"><span>Commission paid</span><b>{pkr(s.commissions.paid)}</b></p>
            <p className="flex justify-between"><span>Outstanding</span><b>{pkr(s.commissions.outstanding)}</b></p>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Cash pending by collector">
          <DataTable head={<><Th>Collector</Th><Th>Orders</Th><Th className="text-right">Amount</Th></>} empty={!s.cash_pending.by_collector.length}>
            {s.cash_pending.by_collector.map((c: any) => (
              <tr key={String(c.id)}><Td>{c.name}</Td><Td>{c.count}</Td><Td className="text-right font-mono">{pkr(c.total)}</Td></tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title="By salesperson / affiliate">
          <DataTable head={<><Th>Name</Th><Th>Orders</Th><Th className="text-right">Revenue</Th><Th className="text-right">Commission</Th></>} empty={!s.by_salesperson.length && !s.by_earner.length}>
            {s.by_salesperson.map((b: any) => (
              <tr key={`s${b.id}`}><Td>{b.name} <span className="text-[11px] text-gray-400">sales owner</span></Td><Td>{b.orders}</Td><Td className="text-right font-mono">{pkr(b.revenue)}</Td><Td className="text-right">-</Td></tr>
            ))}
            {s.by_earner.map((b: any) => (
              <tr key={`e${b.id}`}><Td>{b.name} <span className="text-[11px] text-gray-400">{label(b.type)}</span></Td><Td>{b.orders}</Td><Td className="text-right font-mono">{pkr(b.revenue)}</Td><Td className="text-right font-mono">{pkr(b.commission)}</Td></tr>
            ))}
          </DataTable>
        </Panel>
      </div>
    </div>
  );
}
