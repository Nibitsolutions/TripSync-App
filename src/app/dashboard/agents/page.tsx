"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserCog, Loader2, X } from "lucide-react";
import { useSession } from "next-auth/react";

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  default_commission_rate?: number | null;
}

export default function AgentsPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [role, setRole] = useState("");
  const [rate, setRate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/users");
    const data = await res.json();
    setUsers(data.users || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = (user: User) => {
    setEditingUser(user);
    setRole(user.role);
    setRate(user.default_commission_rate !== undefined && user.default_commission_rate !== null ? String(user.default_commission_rate) : "");
  };

  async function update() {
    if (!editingUser) return;
    setSubmitting(true);
    const res = await fetch(`/api/users/${editingUser._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, default_commission_rate: rate === "" ? null : parseFloat(rate) }),
    });
    if (res.ok) {
      setEditingUser(null);
      load();
    } else {
      const d = await res.json();
      alert(d.error);
    }
    setSubmitting(false);
  }

  const currentUserRole = (session?.user as { role?: string })?.role;
  const isManager = currentUserRole === "Owner" || currentUserRole === "Accountant";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">Team &amp; Agents</h1>
        <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">Manage agency team members, permissions, and agent default commission rates</p>
      </div>

      {/* Inline Edit User Form Card */}
      {editingUser && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113] shadow-md">
          <CardHeader className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <UserCog className="h-5 w-5 text-primary" /> Edit Team Member — {editingUser.name}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setEditingUser(null)} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-5">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-[12px] text-gray-400 font-medium uppercase">Name</Label>
                  <p className="text-[14px] font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{editingUser.name}</p>
                </div>
                <div>
                  <Label className="text-[12px] text-gray-400 font-medium uppercase">Email</Label>
                  <p className="text-[14px] font-medium text-gray-500 mt-0.5">{editingUser.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Role *</Label>
                  <Select value={role} onValueChange={(v) => v && setRole(v)}>
                    <SelectTrigger className="h-10 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Owner", "Accountant", "Agent", "Viewer"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {role === "Agent" && (
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-semibold">Default Commission Rate (%)</Label>
                    <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 5" className="h-10 font-mono text-[13px]" />
                  </div>
                )}
              </div>
              <div className="flex gap-2 justify-end pt-2 border-t border-gray-100 dark:border-[#1e1e21]">
                <Button variant="outline" onClick={() => setEditingUser(null)} disabled={submitting}>Cancel</Button>
                <Button onClick={update} disabled={submitting} className="gap-2">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Team Members Table Card */}
      <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
        <CardHeader className="px-6 pt-5 pb-3">
          <CardTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-50">Team Members</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-5">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-100 dark:border-[#1e1e21]">
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Name</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Email</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Role</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Default Comm %</TableHead>
                    {isManager && <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u._id} className="border-gray-100 dark:border-[#1e1e21] hover:bg-gray-50/50 dark:hover:bg-[#151517]">
                      <TableCell className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{u.name}</TableCell>
                      <TableCell className="text-[13px] text-gray-500">{u.email}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          u.role === "Owner" ? "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400" :
                          u.role === "Accountant" ? "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400" :
                          u.role === "Agent" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" :
                          "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                        }`}>{u.role}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-[13px] text-gray-600 dark:text-gray-300">
                        {u.role === "Agent" ? (u.default_commission_rate !== null && u.default_commission_rate !== undefined ? `${u.default_commission_rate}%` : "Not Set") : "-"}
                      </TableCell>
                      {isManager && (
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px] cursor-pointer" onClick={() => startEdit(u)}>
                            <UserCog className="h-3.5 w-3.5" /> Edit
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
