"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Landmark, X } from "lucide-react";

interface TaxCode { _id: string; code: string; category: string; rate: number; active: boolean; }

export default function TaxCodesPage() {
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("FBR");
  const [rate, setRate] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/tax-codes");
    const data = await res.json();
    setTaxCodes(data.tax_codes || []); setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    const res = await fetch("/api/tax-codes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, category, rate: parseFloat(rate) }) });
    if (res.ok) { setShowNew(false); setCode(""); setRate(""); load(); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">Tax Codes</h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">IATA/BSP and FBR tax code management</p>
        </div>
        {!showNew && (
          <Button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" /> New Tax Code
          </Button>
        )}
      </div>

      {/* Inline Create Tax Code Form Card */}
      {showNew && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113] shadow-md">
          <CardHeader className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <Landmark className="h-5 w-5 text-primary" /> Add New Tax Code
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowNew(false)} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-5">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Code *</Label>
                  <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. GST-17" className="h-10 text-[13px]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Category *</Label>
                  <Select value={category} onValueChange={(v) => v && setCategory(v)}>
                    <SelectTrigger className="h-10 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FBR">FBR (Pakistani Tax)</SelectItem>
                      <SelectItem value="IATA_BSP">IATA / BSP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Rate (%) *</Label>
                  <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} className="h-10 font-mono text-[13px]" placeholder="0" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
                <Button onClick={create} disabled={!code || !rate} className="gap-2">
                  <Landmark className="h-4 w-4" /> Create Tax Code
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tax Codes Table Card */}
      <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
        <CardHeader className="px-6 pt-5 pb-3"><CardTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-50">All Tax Codes</CardTitle></CardHeader>
        <CardContent className="px-6 pb-5">
          {loading ? (
            <div className="flex items-center justify-center py-12"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-100 dark:border-[#1e1e21]">
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Code</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Category</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Rate</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taxCodes.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-12 text-[13px] text-gray-400">No tax codes yet</TableCell></TableRow>
                  ) : taxCodes.map((t) => (
                    <TableRow key={t._id} className="border-gray-100 dark:border-[#1e1e21] hover:bg-gray-50/50 dark:hover:bg-[#151517]">
                      <TableCell className="font-mono text-[13px] font-semibold text-gray-900 dark:text-gray-100">{t.code}</TableCell>
                      <TableCell><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${t.category === "FBR" ? "bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400" : "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"}`}>{t.category.replace("_", " / ")}</span></TableCell>
                      <TableCell className="text-right font-mono text-[13px] text-gray-600 dark:text-gray-300">{t.rate}%</TableCell>
                      <TableCell><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${t.active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>{t.active ? "Active" : "Inactive"}</span></TableCell>
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
