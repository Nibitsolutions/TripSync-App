"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ActionDialog, ActionSpec, DataTable, ErrorNote, Loading, NativeSelect, PageHeader, Pager, Panel, StatusBadge, Td, Th, api, dmy, label, qs, useApi, useCan, useDebounced,
} from "@/components/platform/kit";

/* eslint-disable @typescript-eslint/no-explicit-any */
function bytes(n: number | null) {
  if (!n) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export default function ArchivePage() {
  const can = useCan();
  const manage = can("archive.manage");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const { data, loading, error, reload } = useApi<any>(`/api/admin/archive${qs({ status, q, page })}`, []);
  const [spec, setSpec] = useState<ActionSpec | null>(null);

  const act = (a: any, action: string, s: Partial<ActionSpec>) =>
    setSpec({ title: "", confirmLabel: "Confirm", run: (v) => api(`/api/admin/archive/${a._id}/${action}`, { body: v }), onDone: reload, ...s } as ActionSpec);

  return (
    <div>
      <PageHeader title="Archive" subtitle="Offboarded agencies, retention and cold storage. Nothing is ever auto-deleted." />
      <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-4 py-3 text-[12px] text-amber-800 dark:text-amber-300">
        Statutory record-keeping periods may apply to an agency&apos;s financial records. RETAIN is the recommended decision — confirm policy with your accountant before using DELETE.
        Cold-storage snapshots are not backups; keep regular database backups too.
      </div>
      <Panel>
        <div className="flex gap-2 py-2">
          <Input placeholder="Search agency" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-[240px]" />
          <NativeSelect value={status} onChange={(v) => { setStatus(v); setPage(1); }} placeholder="All archive states" options={["OFFBOARDED", "COLD_STORAGE", "PURGED"]} />
        </div>
        <ErrorNote message={error} />
        {loading && !data ? <Loading /> : (
          <>
            <DataTable empty={!data?.data.length} head={<><Th>Agency</Th><Th>Status</Th><Th>Reason</Th><Th>Offboarded</Th><Th>Retention until</Th><Th>Days left</Th><Th>Size</Th><Th>Last snapshot</Th><Th>Decision</Th>{manage && <Th>Actions</Th>}</>}>
              {data?.data.map((a: any) => (
                <tr key={a._id}>
                  <Td><Link href={`/admin/agencies/${a._id}`} className="font-semibold hover:underline">{a.name}</Link></Td>
                  <Td><StatusBadge status={a.status} /></Td>
                  <Td className="text-[12px]">{label(a.offboard_reason)}{a.offboard_note && <p className="text-gray-400">{a.offboard_note}</p>}</Td>
                  <Td className="text-[12px]">{dmy(a.offboarded_at)}</Td>
                  <Td className="text-[12px]">{dmy(a.retention_until)}</Td>
                  <Td>{a.days_left ?? "-"}</Td>
                  <Td className="text-[12px]">{a.estimated_rows !== null ? `${a.estimated_rows} rows` : bytes(a.snapshot_size_bytes)}</Td>
                  <Td className="text-[12px]">{a.last_snapshot ? <><StatusBadge status={a.last_snapshot.status} /> <span className="text-gray-400">{label(a.last_snapshot.kind)} · {dmy(a.last_snapshot.created_at)}</span>{a.last_snapshot.error && <p className="text-red-600">{a.last_snapshot.error}</p>}</> : "-"}</Td>
                  <Td>{a.decision ? <StatusBadge status={a.decision} /> : "-"}</Td>
                  {manage && (
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {a.status === "OFFBOARDED" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => act(a, "extend-retention", { title: `Extend retention — ${a.name}`, fields: [{ name: "months", label: "Extra months", type: "number", required: true, defaultValue: "6" }, { name: "reason", label: "Reason", type: "textarea", required: true }], confirmLabel: "Extend" })}>Extend</Button>
                            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => act(a, "snapshot", { title: `Export snapshot now — ${a.name}`, description: "Creates a verified, encrypted manual export. Live data is not touched.", confirmLabel: "Export" })}>Snapshot</Button>
                            <Button size="sm" variant="outline" className="h-7 text-[11px] text-red-600" onClick={() => act(a, "archive-now", { title: `Archive to cold storage now — ${a.name}`, danger: true, description: "Snapshot → verify checksum & row counts → release live rows. If verification fails, nothing is deleted.", fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }], confirmLabel: "Archive now" })}>Archive now</Button>
                          </>
                        )}
                        {a.status === "COLD_STORAGE" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-[11px] text-emerald-600" onClick={() => act(a, "decision", { title: `Retain snapshot — ${a.name}`, fields: [{ name: "note", label: "Note", type: "textarea" }], confirmLabel: "Retain indefinitely", run: (v) => api(`/api/admin/archive/${a._id}/decision`, { body: { ...v, decision: "RETAIN" } }) })}>Retain</Button>
                            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => act(a, "restore", { title: `Restore ${a.name} from cold storage`, description: "Re-imports rows with original ids (aborts safely on any collision) and sets the agency to EXPIRED (read-only). Follow up with a REACTIVATION order.", fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }], confirmLabel: "Restore" })}>Restore</Button>
                            <Button size="sm" variant="outline" className="h-7 text-[11px] text-red-600" onClick={() => act(a, "decision", {
                              title: `Permanently delete snapshot — ${a.name}`,
                              danger: true,
                              description: <>This deletes the only remaining copy of this agency&apos;s data. Metadata is kept and status becomes PURGED. <b>Type the agency name exactly</b> to confirm.</>,
                              fields: [{ name: "confirm_name", label: `Type "${a.name}"`, required: true }, { name: "reason", label: "Reason", type: "textarea", required: true }],
                              confirmLabel: "Delete permanently",
                              run: (v) => api(`/api/admin/archive/${a._id}/decision`, { body: { ...v, decision: "DELETE" } }),
                            })}>Delete</Button>
                          </>
                        )}
                      </div>
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
