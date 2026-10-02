"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ban, CalendarPlus, Download, Eye, LogOut as Offboard, Play, Plus, Search } from "lucide-react";
import {
  ActionDialog, api, DataTable, dmy, ago, ErrorNote, LinkNotice, Loading, NativeSelect, PageHeader, Pager, Panel,
  StatusBadge, Td, Th, label, qs, useApi, useCan, useDebounced, useMe,
} from "@/components/platform/kit";
import { AccessCell, AgencyRow, useAgencyActions } from "@/components/platform/agency-shared";

export default function AgenciesPage() {
  const can = useCan();
  const me = useMe();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ status: "", source: "", sales_owner: "", expiring_days: "", consent: "", created_from: "", created_to: "", sort: "created_desc" });
  const q = useDebounced(search);
  const query = qs({ page, page_size: 25, q, ...filters });
  const { data, loading, error, reload } = useApi<{ data: AgencyRow[]; total: number; page_size: number }>(`/api/admin/agencies${query}`, []);
  const lookups = useApi<{ sales_executives: { id: string; name: string }[] }>("/api/admin/lookups");
  const actions = useAgencyActions(reload);
  const [link, setLink] = useState<string | null>(null);

  const set = (k: keyof typeof filters) => (v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };

  const createTrial = () =>
    actions.setSpec({
      title: "Create trial agency",
      description: "Creates a 7-day trial. The owner receives a link to set their password. Paid onboarding goes through Orders.",
      fields: [
        { name: "business_name", label: "Business name", required: true },
        { name: "owner_name", label: "Owner name", required: true },
        { name: "owner_email", label: "Owner email", required: true },
        { name: "owner_phone", label: "Owner phone" },
        { name: "business_address", label: "Business address" },
        ...(me?.user.role !== "SalesExecutive"
          ? [{ name: "sales_owner_id", label: "Sales owner", type: "select" as const, options: (lookups.data?.sales_executives ?? []).map((s) => ({ value: s.id, label: s.name })) }]
          : []),
        { name: "internal_note", label: "Internal note", type: "textarea" as const },
      ],
      confirmLabel: "Create trial",
      run: (v) => api<{ set_password_link: string }>("/api/admin/agencies", { body: v }),
      onDone: (r) => {
        setLink((r as { set_password_link: string }).set_password_link);
        reload();
      },
    });

  return (
    <div>
      <PageHeader
        title="Agencies"
        subtitle="Directory and lifecycle control"
        actions={
          <>
            <a href={`/api/admin/agencies${qs({ q, ...filters, format: "csv" })}`}>
              <Button variant="outline" className="gap-1.5"><Download className="h-4 w-4" /> Export</Button>
            </a>
            {can("agencies.create_trial") && (
              <Button onClick={createTrial} className="gap-1.5 bg-red-600 hover:bg-red-700 text-white"><Plus className="h-4 w-4" /> Create trial</Button>
            )}
          </>
        }
      />
      <LinkNotice link={link} onClose={() => setLink(null)} title="Trial created — owner set-password link" />

      <Panel>
        <div className="flex flex-wrap gap-2 py-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-gray-400" />
            <Input placeholder="Search name, owner, email, phone" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="h-9 pl-8 w-[260px]" />
          </div>
          <NativeSelect value={filters.status} onChange={set("status")} placeholder="All statuses" options={["TRIAL", "ACTIVE", "EXPIRED", "SUSPENDED", "OFFBOARDED", "PENDING", "REJECTED"]} />
          <NativeSelect value={filters.source} onChange={set("source")} placeholder="All sources" options={["PUBLIC_TRIAL", "PUBLIC_PURCHASE", "SALES_EXEC", "ADMIN_CREATED", "LEGACY"]} />
          {me?.user.role !== "SalesExecutive" && (
            <NativeSelect value={filters.sales_owner} onChange={set("sales_owner")} placeholder="Any sales owner" options={[{ value: "none", label: "No owner" }, ...(lookups.data?.sales_executives ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
          )}
          <NativeSelect value={filters.expiring_days} onChange={set("expiring_days")} placeholder="Any expiry" options={[{ value: "7", label: "Expiring ≤ 7d" }, { value: "14", label: "Expiring ≤ 14d" }, { value: "30", label: "Expiring ≤ 30d" }]} />
          <NativeSelect value={filters.consent} onChange={set("consent")} placeholder="Any consent" options={[{ value: "yes", label: "Marketing consent" }, { value: "no", label: "No consent" }]} />
          <Input type="date" value={filters.created_from} onChange={(e) => set("created_from")(e.target.value)} className="h-9 w-[140px]" title="Created from" />
          <Input type="date" value={filters.created_to} onChange={(e) => set("created_to")(e.target.value)} className="h-9 w-[140px]" title="Created to" />
          <NativeSelect value={filters.sort} onChange={set("sort")} options={[{ value: "created_desc", label: "Newest" }, { value: "created_asc", label: "Oldest" }, { value: "expires_asc", label: "Expiry soonest" }, { value: "name_asc", label: "Name A–Z" }, { value: "last_active_desc", label: "Last active" }]} />
        </div>
        <ErrorNote message={error} />
        {loading && !data ? (
          <Loading />
        ) : (
          <>
            <DataTable
              empty={!data?.data.length}
              head={<><Th>Agency</Th><Th>Owner</Th><Th>Status</Th><Th>Access</Th><Th>Plan</Th><Th>Users</Th><Th>Branches</Th><Th>Source</Th><Th>Sales owner</Th><Th>Last active</Th><Th>Created</Th><Th>Actions</Th></>}
            >
              {data?.data.map((a) => (
                <tr key={a._id} className="hover:bg-gray-50/50 dark:hover:bg-[#151517]">
                  <Td>
                    <Link href={`/admin/agencies/${a._id}`} className="font-semibold text-gray-900 dark:text-gray-100 hover:underline">{a.name}</Link>
                    <p className="text-[11px] text-gray-400">{a.email || "-"}</p>
                    {a.possible_duplicate && <p className="text-[10px] text-amber-600 font-semibold">Possible duplicate</p>}
                  </Td>
                  <Td><p>{a.owner.name || "-"}</p><p className="text-[11px] text-gray-400 font-mono">{a.owner.email}</p></Td>
                  <Td><StatusBadge status={a.status} /></Td>
                  <Td><AccessCell a={a} /></Td>
                  <Td className="whitespace-nowrap">{a.seat_limit} seats / {a.branch_limit} br</Td>
                  <Td>{a.user_count} / {a.seat_limit}</Td>
                  <Td>{a.branches_used} / {a.branch_limit}</Td>
                  <Td className="text-[12px]">{label(a.source)}</Td>
                  <Td className="text-[12px]">{a.sales_owner_name ?? <span className="text-gray-400">—</span>}</Td>
                  <Td className="text-[12px]">{a.last_active_at ? ago(a.last_active_at) : "-"}</Td>
                  <Td className="font-mono text-[12px]">{dmy(a.created_at)}</Td>
                  <Td>
                    <div className="flex gap-1">
                      <Link href={`/admin/agencies/${a._id}`}><Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]"><Eye className="h-3 w-3" /> View</Button></Link>
                      {can("agencies.extend_complimentary") && ["TRIAL", "ACTIVE", "EXPIRED"].includes(a.status) && (
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" title="Complimentary extension" onClick={() => actions.extend(a)}><CalendarPlus className="h-3 w-3" /></Button>
                      )}
                      {can("agencies.suspend") && ["TRIAL", "ACTIVE", "EXPIRED"].includes(a.status) && (
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px] text-red-600" onClick={() => actions.suspend(a)}><Ban className="h-3 w-3" /> Suspend</Button>
                      )}
                      {can("agencies.activate") && a.status === "SUSPENDED" && (
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px] text-emerald-600" onClick={() => actions.activate(a)}><Play className="h-3 w-3" /> Activate</Button>
                      )}
                      {can("agencies.offboard") && ["TRIAL", "ACTIVE", "EXPIRED", "SUSPENDED"].includes(a.status) && (
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" title="Offboard" onClick={() => actions.offboard(a)}><Offboard className="h-3 w-3" /></Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </DataTable>
            {data && <Pager page={page} pageSize={data.page_size} total={data.total} onPage={setPage} />}
          </>
        )}
      </Panel>
      <ActionDialog spec={actions.spec} onClose={() => actions.setSpec(null)} />
    </div>
  );
}
