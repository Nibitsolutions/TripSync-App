"use client";

import { useState } from "react";
import { Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ActionDialog, ActionSpec, Badge, DataTable, ErrorNote, Loading, NativeSelect, PageHeader, Pager, Panel, Stat, Td, Th, api, dmy, label, pkr, qs, useApi, useCan,
} from "@/components/platform/kit";

/* eslint-disable @typescript-eslint/no-explicit-any */
const CATS = ["INFRASTRUCTURE", "EMAIL", "SALARIES", "MARKETING", "SUPPORT_TOOLS", "OTHER"];

export default function CostsPage() {
  const can = useCan();
  const write = can("costs.write");
  const [f, setF] = useState({ category: "", from: "", to: "", include_void: "" });
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<any>(`/api/admin/costs${qs({ ...f, page })}`, []);
  const [spec, setSpec] = useState<ActionSpec | null>(null);

  const form = (c?: any): ActionSpec["fields"] => [
    { name: "cost_date", label: "Date", type: "date", required: true, defaultValue: c ? new Date(c.cost_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10) },
    { name: "category", label: "Category", type: "select", options: CATS, required: true, defaultValue: c?.category ?? "INFRASTRUCTURE" },
    { name: "description", label: "Description", defaultValue: c?.description ?? "" },
    { name: "amount", label: "Amount (PKR)", type: "number", required: true, defaultValue: c ? String(c.amount) : "" },
    ...(c?.recurring_parent_id ? [] : [{ name: "is_recurring_monthly", label: "Recurring", type: "checkbox" as const, defaultValue: c?.is_recurring_monthly ?? false, placeholder: "Repeat monthly (auto-created each month)" }, { name: "recurring_ends_on", label: "Recurring ends on", type: "date" as const, defaultValue: c?.recurring_ends_on ? new Date(c.recurring_ends_on).toISOString().slice(0, 10) : "" }]),
  ];
  const body = (v: Record<string, string | boolean>) => ({ ...v, amount: Number(v.amount), cost_date: `${v.cost_date}T12:00:00+05:00`, recurring_ends_on: v.recurring_ends_on ? `${v.recurring_ends_on}T23:59:59+05:00` : null });

  const totalManual = data ? Object.values(data.by_category as Record<string, number>).reduce((s, n) => s + n, 0) : 0;
  return (
    <div>
      <PageHeader
        title="Platform Costs"
        subtitle="Manual cost entries for revenue vs cost. Commission payouts are included automatically."
        actions={
          <>
            <a href={`/api/admin/costs${qs({ ...f, format: "csv" })}`}><Button variant="outline" className="gap-1.5"><Download className="h-4 w-4" /> Export</Button></a>
            {write && <Button className="gap-1.5 bg-red-600 hover:bg-red-700 text-white" onClick={() => setSpec({ title: "Add cost", fields: form(), confirmLabel: "Add", run: (v) => api("/api/admin/costs", { body: body(v) }), onDone: reload })}><Plus className="h-4 w-4" /> Add cost</Button>}
          </>
        }
      />
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <Stat title="Manual costs" value={pkr(totalManual)} />
          <Stat title="Commission payouts" value={pkr(data.commission_payouts)} />
          <Stat title="Total costs" value={pkr(totalManual + data.commission_payouts)} />
          <Stat title="Largest category" value={Object.entries(data.by_category as Record<string, number>).sort((a, b) => b[1] - a[1])[0]?.[0]?.replace(/_/g, " ").toLowerCase() ?? "-"} />
        </div>
      )}
      <Panel>
        <div className="flex flex-wrap gap-2 py-2">
          <NativeSelect value={f.category} onChange={(v) => setF({ ...f, category: v })} placeholder="All categories" options={CATS} />
          <Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="h-9 w-[150px]" />
          <Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="h-9 w-[150px]" />
          <label className="flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={!!f.include_void} onChange={(e) => setF({ ...f, include_void: e.target.checked ? "1" : "" })} /> Show voided</label>
        </div>
        <ErrorNote message={error} />
        {loading && !data ? <Loading /> : (
          <>
            <DataTable empty={!data?.data.length} head={<><Th>Date</Th><Th>Category</Th><Th>Description</Th><Th className="text-right">Amount</Th><Th>Flags</Th>{write && <Th>Actions</Th>}</>}>
              {data?.data.map((c: any) => (
                <tr key={c._id} className={c.voided_at ? "opacity-50" : ""}>
                  <Td>{dmy(c.cost_date)}</Td>
                  <Td className="text-[12px]">{label(c.category)}</Td>
                  <Td className="text-[12px]">{c.description}</Td>
                  <Td className="text-right font-mono">{pkr(c.amount)}</Td>
                  <Td>{c.is_recurring_monthly && <Badge tone="blue">Recurring</Badge>}{c.recurring_parent_id && <Badge>Auto</Badge>}{c.voided_at && <Badge tone="red">Void: {c.void_reason}</Badge>}</Td>
                  {write && (
                    <Td>
                      {!c.voided_at && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setSpec({ title: "Edit cost", fields: form(c), confirmLabel: "Save", run: (v) => api(`/api/admin/costs/${c._id}`, { method: "PATCH", body: body(v) }), onDone: reload })}>Edit</Button>
                          <Button size="sm" variant="outline" className="h-7 text-[11px] text-red-600" onClick={() => setSpec({ title: "Void cost", danger: true, description: "Costs are voided, never deleted.", fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }], confirmLabel: "Void", run: (v) => api(`/api/admin/costs/${c._id}`, { body: v }), onDone: reload })}>Void</Button>
                        </div>
                      )}
                    </Td>
                  )}
                </tr>
              ))}
            </DataTable>
            {data && <Pager page={page} pageSize={data.page_size} total={data.total} onPage={setPage} />}
          </>
        )}
      </Panel>
      <ActionDialog spec={spec} onClose={() => setSpec(null)} />
    </div>
  );
}
