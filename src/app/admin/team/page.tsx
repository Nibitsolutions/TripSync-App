"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ActionDialog, ActionSpec, Badge, DataTable, ErrorNote, LinkNotice, Loading, PageHeader, Panel, Td, Th, api, dmy, useApi, useMe,
} from "@/components/platform/kit";

/* eslint-disable @typescript-eslint/no-explicit-any */
const ROLES = [
  { value: "SuperAdmin", label: "Super Admin" },
  { value: "Manager", label: "Manager" },
  { value: "SalesExecutive", label: "Sales Executive" },
];
const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;

export default function TeamPage() {
  const me = useMe();
  const { data, loading, error, reload } = useApi<{ data: any[] }>("/api/admin/team");
  const [spec, setSpec] = useState<ActionSpec | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const salesExecs = (data?.data ?? []).filter((u) => u.role === "SalesExecutive" && u.is_active);
  const onLink = (r: any) => { if (r?.set_password_link) setLink(r.set_password_link); reload(); };

  const invite = () =>
    setSpec({
      title: "Invite platform user",
      description: "They receive a set-password link by email. Sales Executives get a commission earner record automatically (default 0%).",
      fields: [
        { name: "name", label: "Name", required: true },
        { name: "email", label: "Email", required: true },
        { name: "role", label: "Role", type: "select", options: ROLES, required: true, defaultValue: "SalesExecutive" },
      ],
      confirmLabel: "Invite",
      run: (v) => api("/api/admin/team", { body: v }),
      onDone: onLink,
    });
  const edit = (u: any) =>
    setSpec({
      title: `Edit ${u.name}`,
      fields: [
        { name: "name", label: "Name", required: true, defaultValue: u.name },
        { name: "role", label: "Role", type: "select", options: ROLES, required: true, defaultValue: u.role },
      ],
      confirmLabel: "Save",
      run: (v) => api(`/api/admin/team/${u._id}`, { method: "PATCH", body: v }),
      onDone: reload,
    });
  const deactivate = (u: any) =>
    setSpec({
      title: `Deactivate ${u.name}`,
      danger: true,
      description: `Sessions end immediately and their open tickets move to Unassigned. ${u.agencies_owned ? `They own ${u.agencies_owned} agencies — reassign them now or later.` : ""}`,
      fields: u.agencies_owned
        ? [{ name: "reassign_to", label: "Reassign their agencies to", type: "select", options: salesExecs.filter((s) => s._id !== u._id).map((s) => ({ value: s._id, label: s.name })) }]
        : [],
      confirmLabel: "Deactivate",
      run: (v) => api(`/api/admin/team/${u._id}`, { method: "PATCH", body: { is_active: false, ...(v.reassign_to ? { reassign_to: v.reassign_to } : {}) } }),
      onDone: reload,
    });
  const action = (u: any, a: string, title: string) =>
    setSpec({ title: `${title} — ${u.name}`, confirmLabel: title, run: () => api(`/api/admin/team/${u._id}?action=${a}`, { body: {} }), onDone: onLink });

  return (
    <div>
      <PageHeader title="Team" subtitle="Platform users and roles (users are deactivated, never deleted)" actions={<Button className="gap-1.5 bg-red-600 hover:bg-red-700 text-white" onClick={invite}><Plus className="h-4 w-4" /> Invite user</Button>} />
      <LinkNotice link={link} onClose={() => setLink(null)} title="Set-password link" />
      <Panel>
        <ErrorNote message={error} />
        {loading && !data ? <Loading /> : (
          <DataTable empty={!data?.data.length} head={<><Th>Name</Th><Th>Role</Th><Th>Status</Th><Th>2FA</Th><Th>Agencies owned</Th><Th>Last login</Th><Th>Actions</Th></>}>
            {data?.data.map((u) => (
              <tr key={u._id} className={u.is_active ? "" : "opacity-60"}>
                <Td><p className="font-semibold">{u.name}</p><p className="text-[11px] text-gray-400 font-mono">{u.email}</p></Td>
                <Td>{roleLabel(u.role)}</Td>
                <Td>{u.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}{u.locked_until && new Date(u.locked_until) > new Date() && <Badge tone="red">Locked</Badge>}</Td>
                <Td>{u.totp_enabled ? <Badge tone="green">On</Badge> : <Badge tone={u.role === "SalesExecutive" ? "gray" : "amber"}>Off</Badge>}</Td>
                <Td>{u.agencies_owned || "-"}</Td>
                <Td className="text-[12px]">{dmy(u.last_login_at, true)}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => edit(u)} disabled={u._id === me?.user.id}>Edit</Button>
                    {u.is_active ? (
                      u._id !== me?.user.id && <Button size="sm" variant="outline" className="h-7 text-[11px] text-red-600" onClick={() => deactivate(u)}>Deactivate</Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => api(`/api/admin/team/${u._id}`, { method: "PATCH", body: { is_active: true } }).then(reload).catch((e) => alert(e.message))}>Reactivate</Button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => action(u, "reset-password", "Reset password")}>Reset password</Button>
                    {u.totp_enabled && <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => action(u, "reset-2fa", "Reset 2FA")}>Reset 2FA</Button>}
                    {u.locked_until && new Date(u.locked_until) > new Date() && <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => action(u, "unlock", "Unlock")}>Unlock</Button>}
                  </div>
                </Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
      <ActionDialog spec={spec} onClose={() => setSpec(null)} />
    </div>
  );
}
