"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Landmark, Plus, Edit, Power, X, Check, Loader2 } from "lucide-react";
import { apiFetch, notify } from "@/lib/notify";
import {
  BankAccountKind,
  BankAccountRecord,
  bankAccountLabel,
  bankAccountMissingFields,
  CASH_IN_HAND_KEY,
} from "@/lib/bankAccounts";

type Draft = { kind: BankAccountKind; bank_name: string; account_title: string; account_number: string; branch: string; name: string };
const emptyDraft: Draft = { kind: "Bank", bank_name: "", account_title: "", account_number: "", branch: "", name: "" };

/**
 * Agency Settings → Banks & Cash. These entries feed the Bank / Source dropdown on vouchers
 * (enabled ones only). Owner and Accountant manage the list; everyone else only sees it.
 */
export function BankAccountsCard() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role || "";
  const canManage = role === "Owner" || role === "Accountant";

  const [accounts, setAccounts] = useState<BankAccountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null); // "new" while adding
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ bank_accounts?: BankAccountRecord[] }>("/api/bank-accounts");
      setAccounts(d.bank_accounts || []);
    } catch (e) {
      notify.error("Failed to load bank accounts", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startAdd = () => {
    setDraft(emptyDraft);
    setEditingId("new");
  };

  const startEdit = (a: BankAccountRecord) => {
    setDraft({
      kind: a.kind,
      bank_name: a.bank_name || "",
      account_title: a.account_title || "",
      account_number: a.account_number || "",
      branch: a.branch || "",
      name: a.name || "",
    });
    setEditingId(a._id);
  };

  async function save() {
    const missing = bankAccountMissingFields(draft);
    if (missing.length) {
      notify.error("Please fill in all required fields", missing);
      return;
    }
    setSaving(true);
    try {
      await apiFetch(editingId === "new" ? "/api/bank-accounts" : `/api/bank-accounts/${editingId}`, {
        method: editingId === "new" ? "POST" : "PATCH",
        body: draft,
      });
      notify.success(editingId === "new" ? `"${bankAccountLabel(draft)}" added` : `"${bankAccountLabel(draft)}" updated`);
      setEditingId(null);
      load();
    } catch (e) {
      notify.error("Failed to save bank account", e);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(a: BankAccountRecord) {
    try {
      await apiFetch(`/api/bank-accounts/${a._id}`, { method: "PATCH", body: { enabled: !a.enabled } });
      notify.success(`"${bankAccountLabel(a)}" ${a.enabled ? "disabled" : "enabled"}`);
      load();
    } catch (e) {
      notify.error(`Failed to ${a.enabled ? "disable" : "enable"} "${bankAccountLabel(a)}"`, e);
    }
  }

  const set = (field: keyof Draft, value: string) => setDraft((d) => ({ ...d, [field]: value }));
  const editingSystemCash = editingId !== "new" && accounts.find((a) => a._id === editingId)?.system_key === CASH_IN_HAND_KEY;

  return (
    <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
      <CardHeader className="px-6 pt-5 pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-[14px] font-semibold text-gray-900 dark:text-gray-50 flex items-center gap-2">
          <Landmark className="h-4 w-4 text-primary" /> Banks & Cash
        </CardTitle>
        {canManage && editingId === null && (
          <Button size="sm" variant="outline" onClick={startAdd} className="gap-1.5 h-8 text-[12px]">
            <Plus className="h-3.5 w-3.5" /> Add Bank / Cash
          </Button>
        )}
      </CardHeader>
      <CardContent className="px-6 pb-6 space-y-4">
        <p className="text-[12px] text-gray-500 dark:text-gray-400">
          Enabled entries appear in the Bank / Source list on vouchers. Disable an account to hide it without deleting it.
        </p>

        {editingId !== null && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50/60 dark:bg-slate-900/30">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold">{editingId === "new" ? "Add Bank / Cash" : "Edit Entry"}</span>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px]">Type *</Label>
                <Select value={draft.kind} onValueChange={(v) => v && set("kind", v)} disabled={editingSystemCash}>
                  <SelectTrigger className="h-9 w-full text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bank">Bank</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {draft.kind === "Cash" ? (
                <div className="space-y-1.5">
                  <Label className="text-[12px]">Name *</Label>
                  <Input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Petty Cash" className="h-9" />
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">Bank Name *</Label>
                    <Input value={draft.bank_name} onChange={(e) => set("bank_name", e.target.value)} placeholder="e.g. UBL" className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">Account Title *</Label>
                    <Input value={draft.account_title} onChange={(e) => set("account_title", e.target.value)} placeholder="e.g. Corporate" className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">Account Number *</Label>
                    <Input value={draft.account_number} onChange={(e) => set("account_number", e.target.value)} placeholder="e.g. 1102-887410" className="h-9 font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">Branch *</Label>
                    <Input value={draft.branch} onChange={(e) => set("branch", e.target.value)} placeholder="e.g. Main Boulevard, Lahore" className="h-9" />
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-gray-500 font-mono">Shows on vouchers as: {bankAccountLabel(draft) || "—"}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
                </Button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-[#1e1e21] rounded-lg border border-gray-100 dark:border-[#1e1e21]">
            {accounts.length === 0 && <div className="p-4 text-[13px] text-gray-400 text-center">No banks added yet</div>}
            {accounts.map((a) => (
              <div key={a._id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className={`text-[13px] font-medium truncate ${a.enabled ? "text-gray-900 dark:text-gray-100" : "text-gray-400 line-through"}`}>
                    {bankAccountLabel(a)}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {a.kind}
                    {a.kind === "Bank" && a.branch ? ` · ${a.branch}` : ""}
                    {!a.enabled && " · Disabled"}
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Edit" onClick={() => startEdit(a)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-7 w-7 p-0 ${a.enabled ? "text-amber-500" : "text-emerald-500"}`}
                      title={a.enabled ? "Disable" : "Enable"}
                      onClick={() => toggle(a)}
                    >
                      <Power className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
