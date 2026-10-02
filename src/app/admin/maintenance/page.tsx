"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ActionDialog, ActionSpec, DataTable, ErrorNote, Loading, PageHeader, Panel, StatusBadge, Td, Th, api, dmy, fromPktInput, toPktInput, useApi, useCan,
} from "@/components/platform/kit";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function MaintenancePage() {
  const can = useCan();
  const write = can("maintenance.write");
  const { data, loading, error, reload } = useApi<{ data: any[] }>("/api/admin/maintenance");
  const [spec, setSpec] = useState<ActionSpec | null>(null);

  const fields = (w?: any): ActionSpec["fields"] => [
    { name: "title", label: "Title", required: true, defaultValue: w?.title ?? "" },
    { name: "reason_message", label: "Message shown to users", type: "textarea", required: true, defaultValue: w?.reason_message ?? "" },
    { name: "starts_at", label: "Starts (PKT)", type: "datetime-local", required: true, defaultValue: w ? toPktInput(w.starts_at) : "" },
    { name: "ends_at", label: "Ends (PKT)", type: "datetime-local", required: true, defaultValue: w ? toPktInput(w.ends_at) : "" },
    { name: "notify_in_app_from", label: "Show in-app banner from (PKT, empty = now)", type: "datetime-local", defaultValue: w ? toPktInput(w.notify_in_app_from) : "" },
    { name: "override_reason", label: "Reason if longer than 24 h", hint: "Windows over 24 hours need a reason (typo guard)." },
    ...(w ? [] : [{ name: "create_broadcast", label: "Email", type: "checkbox" as const, placeholder: "Also create an OPERATIONAL broadcast draft" }]),
  ];
  const toBody = (v: Record<string, string | boolean>) => ({
    ...v,
    starts_at: fromPktInput(String(v.starts_at)),
    ends_at: fromPktInput(String(v.ends_at)),
    notify_in_app_from: v.notify_in_app_from ? fromPktInput(String(v.notify_in_app_from)) : null,
  });

  const create = () => setSpec({ title: "Schedule maintenance", fields: fields(), confirmLabel: "Schedule", run: (v) => api("/api/admin/maintenance", { body: toBody(v) }), onDone: reload });
  const edit = (w: any) => setSpec({ title: `Edit ${w.title}`, fields: fields(w), confirmLabel: "Save", run: (v) => api(`/api/admin/maintenance/${w._id}`, { method: "PATCH", body: toBody(v) }), onDone: reload });
  const action = (w: any, a: string, title: string, danger = false) =>
    setSpec({ title, danger, description: a === "start-now" ? "The agency app will immediately show the maintenance page and return 503 on its API. Admin and public sites stay up." : undefined, confirmLabel: title, run: () => api(`/api/admin/maintenance/${w._id}?action=${a}`, { body: {} }), onDone: reload });

  return (
    <div>
      <PageHeader
        title="Maintenance"
        subtitle="Scheduled downtime windows — times in Pakistan Standard Time"
        actions={write && <Button className="gap-1.5 bg-red-600 hover:bg-red-700 text-white" onClick={create}><Plus className="h-4 w-4" /> Schedule window</Button>}
      />
      <Panel>
        <ErrorNote message={error} />
        {loading && !data ? <Loading /> : (
          <DataTable empty={!data?.data.length} head={<><Th>Title</Th><Th>Status</Th><Th>Window (PKT)</Th><Th>Banner from</Th><Th>Message</Th>{write && <Th>Actions</Th>}</>}>
            {data?.data.map((w) => (
              <tr key={w._id}>
                <Td className="font-semibold">{w.title}</Td>
                <Td><StatusBadge status={w.state} /></Td>
                <Td className="text-[12px] whitespace-nowrap">{dmy(w.started_early_at || w.starts_at, true)} → {dmy(w.ended_early_at || w.ends_at, true)}{(w.started_early_at || w.ended_early_at) && <p className="text-amber-600">changed manually</p>}</Td>
                <Td className="text-[12px]">{dmy(w.notify_in_app_from, true)}</Td>
                <Td className="text-[12px] max-w-[320px]">{w.reason_message}</Td>
                {write && (
                  <Td>
                    <div className="flex gap-1">
                      {w.state === "SCHEDULED" && <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => edit(w)}>Edit</Button>}
                      {w.state === "SCHEDULED" && <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => action(w, "start-now", "Start now", true)}>Start now</Button>}
                      {w.state === "SCHEDULED" && <Button size="sm" variant="outline" className="h-7 text-[11px] text-red-600" onClick={() => action(w, "cancel", "Cancel window", true)}>Cancel</Button>}
                      {w.state === "ACTIVE" && <Button size="sm" variant="outline" className="h-7 text-[11px] text-emerald-600" onClick={() => action(w, "end-now", "End now")}>End now</Button>}
                    </div>
                  </Td>
                )}
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
      <ActionDialog spec={spec} onClose={() => setSpec(null)} />
    </div>
  );
}
