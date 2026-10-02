"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, ErrorNote, Loading, NativeSelect, PageHeader, Pager, Panel, Td, Th, dmy, label, qs, useApi, useDebounced } from "@/components/platform/kit";

/* eslint-disable @typescript-eslint/no-explicit-any */
function Diff({ before, after }: { before: any; after: any }) {
  if (!before && !after) return <span className="text-gray-400">-</span>;
  return (
    <details className="text-[11px]">
      <summary className="cursor-pointer text-gray-500">changes</summary>
      <div className="grid grid-cols-2 gap-2 mt-1 max-w-[520px]">
        <pre className="bg-gray-50 dark:bg-[#0e0e10] p-2 rounded overflow-x-auto max-h-60">{before ? JSON.stringify(before, null, 1) : "—"}</pre>
        <pre className="bg-gray-50 dark:bg-[#0e0e10] p-2 rounded overflow-x-auto max-h-60">{after ? JSON.stringify(after, null, 1) : "—"}</pre>
      </div>
    </details>
  );
}

function AuditInner() {
  const sp = useSearchParams();
  const lookups = useApi<any>("/api/admin/lookups");
  const [f, setF] = useState({ agency_id: sp.get("agency_id") ?? "", actor_id: "", actor_type: "", entity_type: "", action: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const action = useDebounced(f.action);
  const query = { ...f, action };
  const { data, loading, error } = useApi<any>(`/api/admin/audit-logs${qs({ ...query, page, page_size: 50 })}`, []);
  const set = (k: keyof typeof f) => (v: string) => { setF({ ...f, [k]: v }); setPage(1); };

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Read-only, append-only record of every write by staff, agencies, the public site and system jobs"
        actions={<a href={`/api/admin/audit-logs${qs({ ...query, format: "csv" })}`}><Button variant="outline" className="gap-1.5"><Download className="h-4 w-4" /> Export CSV</Button></a>}
      />
      <Panel>
        <div className="flex flex-wrap gap-2 py-2">
          <Input placeholder="Action prefix (e.g. order.)" value={f.action} onChange={(e) => set("action")(e.target.value)} className="h-9 w-[200px]" />
          <NativeSelect value={f.actor_type} onChange={set("actor_type")} placeholder="Any actor type" options={["PLATFORM_USER", "SYSTEM", "AGENCY_USER", "PUBLIC"]} />
          <NativeSelect value={f.actor_id} onChange={set("actor_id")} placeholder="Any staff user" options={(lookups.data?.staff ?? []).map((s: any) => ({ value: s.id, label: s.name }))} />
          <NativeSelect value={f.entity_type} onChange={set("entity_type")} placeholder="Any entity" options={["agency", "order", "platform_user", "promo_code", "campaign", "price_book", "commission_earner", "commission_payout", "broadcast", "maintenance_window", "platform_cost", "setting", "support_ticket", "job"]} />
          <Input type="date" value={f.from} onChange={(e) => set("from")(e.target.value)} className="h-9 w-[140px]" />
          <Input type="date" value={f.to} onChange={(e) => set("to")(e.target.value)} className="h-9 w-[140px]" />
          {f.agency_id && <Button variant="outline" size="sm" className="h-9" onClick={() => set("agency_id")("")}>Clear agency filter</Button>}
        </div>
        <ErrorNote message={error} />
        {loading && !data ? <Loading /> : (
          <>
            <DataTable empty={!data?.data.length} head={<><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Entity</Th><Th>Agency</Th><Th>Reason</Th><Th>Details</Th><Th>IP / request</Th></>}>
              {data?.data.map((r: any) => (
                <tr key={r._id}>
                  <Td className="text-[12px] whitespace-nowrap">{dmy(r.occurred_at, true)}</Td>
                  <Td className="text-[12px]">{r.actor_name ?? label(r.actor_type)}<p className="text-gray-400">{r.actor_role ?? label(r.actor_type)}</p></Td>
                  <Td className="font-mono text-[12px]">{r.action}</Td>
                  <Td className="text-[12px]">{r.entity_type}<p className="text-gray-400 font-mono text-[10px]">{r.entity_id}</p></Td>
                  <Td className="text-[12px]">{r.agency_name ?? "-"}</Td>
                  <Td className="text-[12px] max-w-[220px]">{r.reason ?? "-"}</Td>
                  <Td><Diff before={r.before} after={r.after} /></Td>
                  <Td className="text-[10px] text-gray-400 font-mono">{r.ip ?? "-"}<br />{r.request_id?.slice(0, 8)}</Td>
                </tr>
              ))}
            </DataTable>
            {data && <Pager page={page} pageSize={data.page_size} total={data.total} onPage={setPage} />}
          </>
        )}
      </Panel>
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AuditInner />
    </Suspense>
  );
}
