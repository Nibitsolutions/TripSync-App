"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Landmark, X, Edit, Check, Power } from "lucide-react";
import { INVOICE_TYPES, InvoiceType, normalizeInvoiceTypes } from "@/lib/taxCodes";
import { apiFetch, notify } from "@/lib/notify";

export type TaxCategory = "Income Tax" | "WHT" | "Airline Tax" | "Other Taxes";

interface TaxCode {
  _id: string;
  name: string;
  code: string;
  category: TaxCategory;
  default_percentage: number | null;
  applicable_invoice_types?: string[];
  active: boolean;
}

export default function TaxCodesPage() {
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState<TaxCategory>("Airline Tax");
  const [defaultPercentage, setDefaultPercentage] = useState("");
  const [applicableTypes, setApplicableTypes] = useState<InvoiceType[]>([]);

  const toggleApplicableType = (t: InvoiceType) =>
    setApplicableTypes((prev) => normalizeInvoiceTypes(prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ tax_codes?: TaxCode[] }>("/api/tax-codes");
      setTaxCodes(data.tax_codes || []);
    } catch (err) {
      notify.error("Failed to load tax codes", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setName("");
    setCode("");
    setCategory("Airline Tax");
    setDefaultPercentage("");
    setApplicableTypes([]);
    setEditingId(null);
    setShowForm(false);
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const handleOpenEdit = (t: TaxCode) => {
    setEditingId(t._id);
    setName(t.name || "");
    setCode(t.code || "");
    setCategory(t.category || "Airline Tax");
    setDefaultPercentage(t.default_percentage !== null && t.default_percentage !== undefined ? String(t.default_percentage) : "");
    // Legacy codes with no tags apply to every type; show that as all boxes ticked
    const types = normalizeInvoiceTypes(t.applicable_invoice_types);
    setApplicableTypes(types.length > 0 ? types : [...INVOICE_TYPES]);
    setShowForm(true);
  };

  async function handleSubmit() {
    const missing: string[] = [];
    if (!name.trim()) missing.push("Name");
    if (!code.trim()) missing.push("Code");
    if (!category) missing.push("Category");
    if (applicableTypes.length === 0) missing.push("At least one Applicable Invoice Type");
    if (missing.length) {
      notify.error("Please fill in all required fields", missing);
      return;
    }

    const payload = {
      name: name.trim(),
      code: code.trim(),
      category,
      default_percentage: defaultPercentage.trim() !== "" ? parseFloat(defaultPercentage) : null,
      applicable_invoice_types: applicableTypes,
    };

    try {
      await apiFetch(editingId ? `/api/tax-codes/${editingId}` : "/api/tax-codes", {
        method: editingId ? "PATCH" : "POST",
        body: payload,
      });
      notify.success(editingId ? `Tax code ${payload.code} updated` : `Tax code ${payload.code} created`);
      resetForm();
      load();
    } catch (e) {
      notify.error(editingId ? "Failed to update tax code" : "Failed to create tax code", e);
    }
  }

  async function toggleActive(t: TaxCode) {
    try {
      await apiFetch(`/api/tax-codes/${t._id}`, { method: "PATCH", body: { active: !t.active } });
      notify.success(`Tax code ${t.code} ${t.active ? "deactivated" : "activated"}`);
      load();
    } catch (e) {
      notify.error(`Failed to ${t.active ? "deactivate" : "activate"} tax code ${t.code}`, e);
    }
  }

  const categoryBadgeStyles: Record<TaxCategory, string> = {
    "Income Tax": "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800",
    "WHT": "bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400 border border-violet-300 dark:border-violet-800",
    "Airline Tax": "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-300 dark:border-blue-800",
    "Other Taxes": "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-300 dark:border-amber-800",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">Tax Codes</h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">
            Manage configurable tax codes and default percentages for invoices
          </p>
        </div>
        {!showForm && (
          <Button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" /> New Tax Code
          </Button>
        )}
      </div>

      {/* Add / Edit Tax Code Form Card */}
      {showForm && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113] shadow-md">
          <CardHeader className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <Landmark className="h-5 w-5 text-primary" /> {editingId ? "Edit Tax Code" : "Add New Tax Code"}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={resetForm} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-5">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Tax Name *</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. City Tax"
                    className="h-10 text-[13px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Tax Code *</Label>
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. CITY_TAX"
                    className="h-10 text-[13px] font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Tax Category *</Label>
                  <Select value={category} onValueChange={(v) => v && setCategory(v as TaxCategory)}>
                    <SelectTrigger className="h-10 text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Income Tax">Income Tax</SelectItem>
                      <SelectItem value="WHT">WHT</SelectItem>
                      <SelectItem value="Airline Tax">Airline Tax</SelectItem>
                      <SelectItem value="Other Taxes">Other Taxes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Default Percentage (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={defaultPercentage}
                    onChange={(e) => setDefaultPercentage(e.target.value)}
                    className="h-10 font-mono text-[13px]"
                    placeholder="Optional (e.g. 10)"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[13px] font-semibold">Applicable Invoice Type(s) *</Label>
                  <button
                    type="button"
                    onClick={() => setApplicableTypes(applicableTypes.length === INVOICE_TYPES.length ? [] : [...INVOICE_TYPES])}
                    className="text-[12px] font-medium text-primary hover:underline"
                  >
                    {applicableTypes.length === INVOICE_TYPES.length ? "Clear all" : "Select all"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {INVOICE_TYPES.map((t) => {
                    const selected = applicableTypes.includes(t);
                    return (
                      <label
                        key={t}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-medium cursor-pointer transition-colors ${
                          selected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleApplicableType(t)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        {t}
                      </label>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400">
                  This tax code will be selectable on new invoices of the chosen type(s).
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={!name.trim() || !code.trim() || applicableTypes.length === 0} className="gap-2">
                  <Check className="h-4 w-4" /> {editingId ? "Save Changes" : "Create Tax Code"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tax Codes Table Card */}
      <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
        <CardHeader className="px-6 pt-5 pb-3">
          <CardTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-50">
            All Configured Tax Codes
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-100 dark:border-[#1e1e21]">
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Tax Name</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Tax Code</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Category</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Default %</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Invoice Types</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taxCodes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7}className="text-center py-12 text-[13px] text-gray-400">
                        No tax codes configured yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    taxCodes.map((t) => (
                      <TableRow key={t._id} className="border-gray-100 dark:border-[#1e1e21] hover:bg-gray-50/50 dark:hover:bg-[#151517]">
                        <TableCell className="text-[13px] font-medium text-gray-900 dark:text-gray-100">
                          {t.name}
                        </TableCell>
                        <TableCell className="font-mono text-[13px] font-semibold text-gray-800 dark:text-gray-200">
                          {t.code}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${categoryBadgeStyles[t.category] || "bg-gray-100 text-gray-700"}`}>
                            {t.category}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-[13px] text-gray-700 dark:text-gray-300">
                          {t.default_percentage !== null && t.default_percentage !== undefined ? `${t.default_percentage}%` : "—"}
                        </TableCell>
                        <TableCell className="max-w-[260px]">
                          {(() => {
                            const types = normalizeInvoiceTypes(t.applicable_invoice_types);
                            if (types.length === 0 || types.length === INVOICE_TYPES.length) {
                              return <span className="text-[12px] text-gray-500 dark:text-gray-400">All types</span>;
                            }
                            return (
                              <div className="flex flex-wrap gap-1">
                                {types.map((type) => (
                                  <span key={type} className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                    {type}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${t.active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
                            {t.active ? "Active" : "Inactive"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEdit(t)}
                              className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                              title="Edit Tax Code"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleActive(t)}
                              className={`h-7 w-7 p-0 ${t.active ? "text-amber-500 hover:text-amber-700" : "text-emerald-500 hover:text-emerald-700"}`}
                              title={t.active ? "Deactivate" : "Activate"}
                            >
                              <Power className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
