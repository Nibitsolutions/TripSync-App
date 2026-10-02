"use client";

import { useState } from "react";
import { Banknote, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ActionDialog, ActionSpec, Badge, DataTable, ErrorNote, Loading, NativeSelect, PageHeader, Panel, StatusBadge, Td, Th,
  api, dmy, label, pkr, qs, useApi, useCan,
} from "@/components/platform/kit";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function AffiliatesPage() {
  const can = useCan();
  const [type, setType] = useState("");
  const list = useApi<{ data: any[] }>(`/api/admin/earners${qs({ type })}`, []);
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useApi<any>(selected ? `/api/admin/earners/${selected}` : null, []);
  const [spec, setSpec] = useState<ActionSpec | null>(null);
  const reloadAll = () => { list.reload(); detail.reload(); };

  const addAffiliate = () =>
    setSpec({
      title: "Add affiliate (UGC creator)",
      description: "Commission terms and the first promo code are set together. Commission accrues only when an order is approved.",
      fields: [
        { name: "name", label: "Name", required: true },
        { name: "phone", label: "Phone" },
        { name: "email", label: "Email" },
        { name: "commission_percent", label: "Commission %", type: "number", required: true, defaultValue: "10" },
        { name: "commission_scope", label: "Scope", type: "select", options: [{ value: "FIRST_PAYMENT_ONLY", label: "First payment only" }, { value: "ALL_PAYMENTS", label: "All payments (recurring)" }], defaultValue: "FIRST_PAYMENT_ONLY", required: true },
        { name: "code", label: "Promo code", placeholder: "e.g. ALI10" },
        { name: "discount_type", label: "Customer discount type", type: "select", options: ["PERCENT", "FLAT"], defaultValue: "PERCENT", required: true },
        { name: "value", label: "Customer discount value", type: "number", defaultValue: "10" },
        { name: "first_order_only", label: "First order only", type: "checkbox", defaultValue: true, placeholder: "Valid on the customer's first paid order" },
        { name: "max_redemptions", label: "Max redemptions", type: "number" },
        { name: "notes", label: "Notes", type: "textarea" },
      ],
      confirmLabel: "Add affiliate",
      run: (v) =>
        api("/api/admin/earners", {
          body: {
            type: "AFFILIATE", name: v.name, phone: v.phone, email: v.email, notes: v.notes,
            commission_percent: Number(v.commission_percent), commission_scope: v.commission_scope,
            promo: v.code ? { code: String(v.code).toUpperCase(), discount_type: v.discount_type, value: Number(v.value), first_order_only: v.first_order_only, max_redemptions: v.max_redemptions || null } : null,
          },
        }),
      onDone: list.reload,
    });

  const edit = (e: any) =>
    setSpec({
      title: `Edit ${e.name}`,
      fields: [
        { name: "phone", label: "Phone", defaultValue: e.phone },
        { name: "email", label: "Email", defaultValue: e.email },
        { name: "commission_percent", label: "Commission %", type: "number", defaultValue: String(e.commission_percent) },
        { name: "commission_scope", label: "Scope", type: "select", options: [{ value: "FIRST_PAYMENT_ONLY", label: "First payment only" }, { value: "ALL_PAYMENTS", label: "All payments" }], defaultValue: e.commission_scope, required: true },
        { name: "is_active", label: "Active", type: "checkbox", defaultValue: e.is_active, placeholder: "Earner is active" },
        { name: "notes", label: "Notes", type: "textarea", defaultValue: e.notes },
      ],
      confirmLabel: "Save",
      run: (v) => api(`/api/admin/earners/${e._id}`, { method: "PATCH", body: { ...v, commission_percent: Number(v.commission_percent) } }),
      onDone: reloadAll,
    });

  const payout = (e: any) =>
    setSpec({
      title: `Record payout — ${e.name}`,
      description: `Outstanding: ${pkr(e.balance.outstanding)}. The payout settles unpaid entries oldest first (reversals net against accruals). No money is moved by the system.`,
      fields: [
        { name: "amount", label: "Amount (PKR)", type: "number", required: true, defaultValue: String(Math.max(0, e.balance.outstanding)) },
        { name: "paid_at", label: "Paid on", type: "date", defaultValue: new Date().toISOString().slice(0, 10) },
        { name: "method", label: "Method", placeholder: "Bank transfer / cash / JazzCash" },
        { name: "reference", label: "Reference" },
        { name: "note", label: "Note", type: "textarea" },
      ],
      confirmLabel: "Record payout",
      run: (v) => api("/api/admin/payouts", { body: { earner_id: e._id, ...v, amount: Number(v.amount) } }),
      onDone: reloadAll,
    });

  const addCode = (e: any) =>
    setSpec({
      title: `New promo code for ${e.name}`,
      fields: [
        { name: "code", label: "Code", required: true },
        { name: "discount_type", label: "Discount type", type: "select", options: ["PERCENT", "FLAT"], defaultValue: "PERCENT", required: true },
        { name: "value", label: "Value", type: "number", required: true },
        { name: "first_order_only", label: "First order only", type: "checkbox", placeholder: "Valid on first paid order only" },
        { name: "max_redemptions", label: "Max redemptions", type: "number" },
      ],
      confirmLabel: "Create code",
      run: (v) => api("/api/admin/promotions", { body: { kind: "PROMO_CODE", owner_earner_id: e._id, ...v, code: String(v.code).toUpperCase(), value: Number(v.value) } }),
      onDone: reloadAll,
    });

  const d = detail.data;
  return (
    <div>
      <PageHeader
        title="Affiliates & Sales Team"
        subtitle="Commission earners, promo codes, commission ledger and payouts"
        actions={can("earners.write") && <Button className="gap-1.5 bg-red-600 hover:bg-red-700 text-white" onClick={addAffiliate}><Plus className="h-4 w-4" /> Add affiliate</Button>}
      />
      <Panel>
        <div className="flex gap-2 py-2">
          <NativeSelect value={type} onChange={setType} placeholder="All earners" options={[{ value: "SALES_EXECUTIVE", label: "Sales executives" }, { value: "AFFILIATE", label: "Affiliates" }]} />
          <p className="text-[12px] text-gray-400 self-center">Sales Executives are added from Team (linked automatically).</p>
        </div>
        <ErrorNote message={list.error} />
        {list.loading && !list.data ? <Loading /> : (
          <DataTable empty={!list.data?.data.length} head={<><Th>Name</Th><Th>Type</Th><Th>Terms</Th><Th>Codes</Th><Th>Orders</Th><Th className="text-right">Revenue</Th><Th className="text-right">Discount</Th><Th className="text-right">Accrued</Th><Th className="text-right">Paid</Th><Th className="text-right">Outstanding</Th><Th></Th></>}>
            {list.data?.data.map((e) => (
              <tr key={e._id} className={`cursor-pointer hover:bg-gray-50/50 dark:hover:bg-[#151517] ${selected === e._id ? "bg-gray-50 dark:bg-[#151517]" : ""}`} onClick={() => setSelected(e._id)}>
                <Td><p className="font-semibold">{e.name}</p><p className="text-[11px] text-gray-400">{e.phone || e.email}</p>{!e.is_active && <Badge>Inactive</Badge>}</Td>
                <Td className="text-[12px]">{label(e.type)}</Td>
                <Td className="text-[12px]">{e.commission_percent}% · {e.commission_scope === "ALL_PAYMENTS" ? "recurring" : "first payment"}</Td>
                <Td className="font-mono text-[12px]">{e.codes.join(", ") || "-"}</Td>
                <Td>{e.performance.orders}</Td>
                <Td className="text-right font-mono">{pkr(e.performance.revenue)}</Td>
                <Td className="text-right font-mono">{pkr(e.performance.discount)}</Td>
                <Td className="text-right font-mono">{pkr(e.balance.accrued)}</Td>
                <Td className="text-right font-mono">{pkr(e.balance.paid)}</Td>
                <Td className={`text-right font-mono ${e.balance.outstanding < 0 ? "text-red-600" : ""}`}>{pkr(e.balance.outstanding)}</Td>
                <Td>
                  <div className="flex gap-1" onClick={(ev) => ev.stopPropagation()}>
                    {can("earners.write") && <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => edit(e)}>Edit</Button>}
                    {can("payouts.write") && <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => payout(e)}><Banknote className="h-3 w-3" /> Payout</Button>}
                  </div>
                </Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>

      {selected && d && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
          <Panel title={`${d.earner.name} — commission ledger`} className="lg:col-span-2">
            <DataTable empty={!d.entries.length} head={<><Th>Date</Th><Th>Order</Th><Th>Agency</Th><Th>Kind</Th><Th className="text-right">Basis</Th><Th>Rate</Th><Th className="text-right">Amount</Th><Th>Status</Th></>}>
              {d.entries.map((c: any) => (
                <tr key={c._id}>
                  <Td>{dmy(c.created_at)}</Td>
                  <Td className="font-mono text-[12px]">{c.order?.order_number ?? "-"}</Td>
                  <Td className="text-[12px]">{c.order?.agency_name ?? "-"}</Td>
                  <Td>{label(c.kind)}</Td>
                  <Td className="text-right font-mono">{pkr(c.basis_amount)}</Td>
                  <Td>{c.rate_percent}%</Td>
                  <Td className={`text-right font-mono ${c.amount < 0 ? "text-red-600" : ""}`}>{pkr(c.amount)}</Td>
                  <Td><StatusBadge status={c.status} /></Td>
                </tr>
              ))}
            </DataTable>
          </Panel>
          <div className="space-y-4">
            <Panel title="Promo codes" actions={can("pricing.write") && <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => addCode(d.earner)}>Add code</Button>}>
              {d.codes.length === 0 ? <p className="text-[13px] text-gray-400">No codes.</p> : d.codes.map((c: any) => (
                <div key={c._id} className="flex justify-between text-[13px] py-1">
                  <span className="font-mono font-semibold">{c.code}</span>
                  <span className="text-gray-500">{c.discount_type === "PERCENT" ? `${c.value}%` : pkr(c.value)}{c.first_order_only ? " · first order" : ""}{c.is_disabled ? " · disabled" : ""}</span>
                </div>
              ))}
            </Panel>
            <Panel title="Payouts">
              {d.payouts.length === 0 ? <p className="text-[13px] text-gray-400">No payouts yet.</p> : d.payouts.map((p: any) => (
                <div key={p._id} className="flex justify-between text-[13px] py-1 border-b border-gray-50 dark:border-[#18181b] last:border-0">
                  <span>{dmy(p.paid_at)} <span className="text-gray-400">{p.method} {p.reference}</span></span>
                  <span className="font-mono">{pkr(p.amount)}</span>
                </div>
              ))}
            </Panel>
          </div>
        </div>
      )}
      <ActionDialog spec={spec} onClose={() => setSpec(null)} />
    </div>
  );
}
