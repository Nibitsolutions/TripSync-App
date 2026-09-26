"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Building2, CalendarPlus, Ban, Play, Eye, Users, Copy, Check } from "lucide-react";
import { formatDateDDMMYYYY } from "@/lib/date-utils";

interface Agency {
  _id: string;
  name: string;
  status: string;
  access_expires_at: string | null;
  max_users: number;
  contact_person: string;
  contact_email: string;
  user_count: number;
  owner: { name: string; email: string } | null;
  is_expired: boolean;
  created_at: string;
}

export default function AgenciesPage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [extendDialog, setExtendDialog] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState("30");
  const [detailDialog, setDetailDialog] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<Record<string, unknown> | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);

  // New agency form
  const [form, setForm] = useState({
    agency_name: "", invoice_prefix: "INV", base_currency: "PKR", max_users: "10",
    access_days: "30", contact_person: "", contact_email: "", contact_phone: "",
    owner_name: "", owner_email: "", owner_password: "", notes: "",
  });

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/agencies");
    const data = await res.json();
    setAgencies(data.agencies || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateForm(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function createAgency() {
    const res = await fetch("/api/admin/agencies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) {
      setCreatedCreds(data.credentials);
      setShowNew(false);
      setForm({ agency_name: "", invoice_prefix: "INV", base_currency: "PKR", max_users: "10", access_days: "30", contact_person: "", contact_email: "", contact_phone: "", owner_name: "", owner_email: "", owner_password: "", notes: "" });
      load();
    } else {
      alert(data.error);
    }
  }

  async function extendAccess() {
    if (!extendDialog) return;
    await fetch(`/api/admin/agencies/${extendDialog}/extend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: parseInt(extendDays) }),
    });
    setExtendDialog(null);
    setExtendDays("30");
    load();
  }

  async function toggleAgency(id: string, action: "suspend" | "activate") {
    await fetch(`/api/admin/agencies/${id}/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    load();
  }

  async function viewDetails(id: string) {
    setDetailDialog(id);
    const res = await fetch(`/api/admin/agencies/${id}`);
    setDetailData(await res.json());
  }

  function copyCredentials() {
    if (!createdCreds) return;
    navigator.clipboard.writeText(`Email: ${createdCreds.email}\nPassword: ${createdCreds.password}`);
    setCopiedCreds(true);
    setTimeout(() => setCopiedCreds(false), 2000);
  }

  function daysRemaining(expiryDate: string | null) {
    if (!expiryDate) return "No expiry";
    const diff = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return "Expired";
    if (diff === 0) return "Expires today";
    return `${diff} days left`;
  }

  const statusStyles: Record<string, string> = {
    Active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    Suspended: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
    Expired: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">Agencies</h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">Create and manage travel agency accounts</p>
        </div>
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogTrigger className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-[13px] font-medium text-white hover:bg-red-700 shadow-sm transition-colors">
            <Plus className="h-4 w-4" /> New Agency
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">Create New Agency</DialogTitle>
            </DialogHeader>
            <div className="space-y-5 pt-2">
              {/* Agency Info */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Agency Information</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label className="text-[13px]">Agency Name *</Label>
                    <Input value={form.agency_name} onChange={(e) => updateForm("agency_name", e.target.value)} className="h-10" placeholder="e.g. Karachi Travels" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Invoice Prefix</Label>
                    <Input value={form.invoice_prefix} onChange={(e) => updateForm("invoice_prefix", e.target.value)} className="h-10 font-mono" placeholder="INV" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Base Currency</Label>
                    <Select value={form.base_currency} onValueChange={(v) => v && updateForm("base_currency", v)}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>{["PKR", "USD", "GBP", "SAR", "AED"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Max Users</Label>
                    <Input type="number" value={form.max_users} onChange={(e) => updateForm("max_users", e.target.value)} className="h-10 font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Access Duration (days)</Label>
                    <Input type="number" value={form.access_days} onChange={(e) => updateForm("access_days", e.target.value)} className="h-10 font-mono" placeholder="30" />
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Contact Details</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5"><Label className="text-[13px]">Contact Person</Label><Input value={form.contact_person} onChange={(e) => updateForm("contact_person", e.target.value)} className="h-10" /></div>
                  <div className="space-y-1.5"><Label className="text-[13px]">Email</Label><Input value={form.contact_email} onChange={(e) => updateForm("contact_email", e.target.value)} className="h-10" /></div>
                  <div className="space-y-1.5"><Label className="text-[13px]">Phone</Label><Input value={form.contact_phone} onChange={(e) => updateForm("contact_phone", e.target.value)} className="h-10" /></div>
                </div>
              </div>

              {/* Owner Account */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Owner Account (Login Credentials)</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5"><Label className="text-[13px]">Owner Name *</Label><Input value={form.owner_name} onChange={(e) => updateForm("owner_name", e.target.value)} className="h-10" /></div>
                  <div className="space-y-1.5"><Label className="text-[13px]">Owner Email *</Label><Input value={form.owner_email} onChange={(e) => updateForm("owner_email", e.target.value)} className="h-10" /></div>
                  <div className="space-y-1.5"><Label className="text-[13px]">Password *</Label><Input value={form.owner_password} onChange={(e) => updateForm("owner_password", e.target.value)} className="h-10 font-mono" /></div>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-[13px]">Notes</Label>
                <Textarea value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} placeholder="Any notes about this agency..." className="min-h-[60px]" />
              </div>

              <Button onClick={createAgency} disabled={!form.agency_name || !form.owner_name || !form.owner_email || !form.owner_password} className="w-full h-10 gap-2 bg-red-600 hover:bg-red-700">
                <Building2 className="h-4 w-4" /> Create Agency
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Created Credentials Banner */}
      {createdCreds && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-semibold text-emerald-800 dark:text-emerald-300">Agency created! Share these credentials:</p>
              <p className="text-[13px] font-mono mt-1 text-emerald-700 dark:text-emerald-400">
                Email: {createdCreds.email} | Password: {createdCreds.password}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 text-[12px]" onClick={copyCredentials}>
                {copiedCreds ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copiedCreds ? "Copied!" : "Copy"}
              </Button>
              <Button size="sm" variant="ghost" className="text-[12px]" onClick={() => setCreatedCreds(null)}>Dismiss</Button>
            </div>
          </div>
        </div>
      )}

      {/* Agencies Table */}
      <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
        <CardHeader className="px-6 pt-5 pb-3">
          <CardTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-50">All Agencies</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-5">
          {loading ? (
            <div className="flex items-center justify-center py-12"><div className="h-5 w-5 animate-spin rounded-full border-2 border-red-600 border-t-transparent" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-100 dark:border-[#1e1e21]">
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Agency</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Owner</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Access</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Users</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Created</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agencies.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-[13px] text-gray-400">No agencies yet. Create your first agency to get started.</TableCell></TableRow>
                  ) : agencies.map((a) => {
                    const displayStatus = a.is_expired ? "Expired" : a.status;
                    return (
                      <TableRow key={a._id} className="border-gray-100 dark:border-[#1e1e21] hover:bg-gray-50/50 dark:hover:bg-[#151517]">
                        <TableCell>
                          <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{a.name}</p>
                          <p className="text-[11px] text-gray-400">{a.contact_email || "-"}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-[13px] text-gray-600 dark:text-gray-300">{a.owner?.name || "-"}</p>
                          <p className="text-[11px] text-gray-400 font-mono">{a.owner?.email || ""}</p>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${statusStyles[displayStatus] || ""}`}>
                            {displayStatus}
                          </span>
                        </TableCell>
                        <TableCell>
                          <p className={`text-[12px] font-medium ${a.is_expired ? "text-red-600 dark:text-red-400" : "text-gray-600 dark:text-gray-300"}`}>
                            {daysRemaining(a.access_expires_at)}
                          </p>
                          {a.access_expires_at && (
                            <p className="text-[10px] text-gray-400 font-mono">{formatDateDDMMYYYY(a.access_expires_at)}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Users className="h-3 w-3 text-gray-400" />
                            <span className="text-[13px] text-gray-600 dark:text-gray-300">{a.user_count} / {a.max_users}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-[13px] text-gray-500 font-mono">{formatDateDDMMYYYY(a.created_at)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]" onClick={() => viewDetails(a._id)}>
                              <Eye className="h-3 w-3" /> View
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]" onClick={() => setExtendDialog(a._id)}>
                              <CalendarPlus className="h-3 w-3" /> Extend
                            </Button>
                            {a.status === "Active" && !a.is_expired ? (
                              <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" onClick={() => toggleAgency(a._id, "suspend")}>
                                <Ban className="h-3 w-3" /> Suspend
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10" onClick={() => toggleAgency(a._id, "activate")}>
                                <Play className="h-3 w-3" /> Activate
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Extend Dialog */}
      <Dialog open={!!extendDialog} onOpenChange={() => setExtendDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-lg font-semibold">Extend Access</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-[13px]">Number of days to extend</Label>
              <div className="grid grid-cols-4 gap-2">
                {["15", "30", "90", "365"].map((d) => (
                  <Button key={d} variant={extendDays === d ? "default" : "outline"} size="sm" onClick={() => setExtendDays(d)} className="text-[12px]">
                    {d} days
                  </Button>
                ))}
              </div>
              <Input type="number" value={extendDays} onChange={(e) => setExtendDays(e.target.value)} className="h-10 font-mono mt-2" />
            </div>
            <Button onClick={extendAccess} className="w-full h-10 gap-2 bg-red-600 hover:bg-red-700">
              <CalendarPlus className="h-4 w-4" /> Extend by {extendDays} days
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailDialog} onOpenChange={() => { setDetailDialog(null); setDetailData(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="text-lg font-semibold">Agency Details</DialogTitle></DialogHeader>
          {detailData && (
            <div className="space-y-5 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  ["Name", (detailData.agency as Record<string, unknown>)?.name],
                  ["Status", (detailData.agency as Record<string, unknown>)?.status],
                  ["Currency", (detailData.agency as Record<string, unknown>)?.base_currency],
                  ["Invoice Prefix", (detailData.agency as Record<string, unknown>)?.invoice_prefix],
                  ["Max Users", (detailData.agency as Record<string, unknown>)?.max_users],
                  ["Expires", (detailData.agency as Record<string, unknown>)?.access_expires_at ? formatDateDDMMYYYY((detailData.agency as Record<string, unknown>).access_expires_at as string) : "No expiry"],
                  ["Contact", (detailData.agency as Record<string, unknown>)?.contact_person || "-"],
                  ["Phone", (detailData.agency as Record<string, unknown>)?.contact_phone || "-"],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label as string}</p>
                    <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 mt-0.5">{value as string}</p>
                  </div>
                ))}
              </div>

              {Boolean((detailData.agency as Record<string, unknown>)?.notes) && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Notes</p>
                  <p className="text-[13px] text-gray-600 dark:text-gray-300 mt-0.5">{(detailData.agency as Record<string, unknown>).notes as string}</p>
                </div>
              )}

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Users</p>
                <div className="space-y-2">
                  {((detailData.users as Array<Record<string, unknown>>) || []).map((u) => (
                    <div key={u._id as string} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-[#0e0e10] border border-gray-100 dark:border-[#1e1e21]">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Users className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{u.name as string}</p>
                        <p className="text-[11px] text-gray-400 font-mono">{u.email as string}</p>
                      </div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        {u.role as string}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
