"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { TypeToSearch, SearchOption } from "@/components/ui/type-to-search";
import {
  Plus, X, Copy, Trash2, Layers, Hotel, Bus, Stamp, Package, ChevronLeft, ChevronRight, RefreshCw, Loader2,
} from "lucide-react";
import {
  ServiceLineItem, ServiceDetails, PaxEntry,
  SERVICE_LABELS, CURRENCIES, CATEGORIES, ROOM_TYPES, ROOM_VIEWS, BOOKING_STATUSES, COSTING_OPTIONS,
  VEHICLES, TRANSPORT_SECTORS, VISA_TYPES, GENERAL_TEMPLATES,
  calculateServiceTotals, createDefaultServiceItem, getQuantityFactor, paxCount,
} from "@/lib/serviceInvoice";

interface Props<T extends ServiceLineItem> {
  serviceType: string;
  items: T[];
  onItemsChange: (items: T[]) => void;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  supplierOptions: SearchOption[];
  suppliers: { _id: string; name: string }[];
  getSupplierName: (id: string) => string;
}

const SERVICE_ICONS: Record<string, typeof Hotel> = {
  Hotel,
  Transport: Bus,
  Visa: Stamp,
};

const toOptions = (list: string[]): SearchOption[] => list.map((v) => ({ value: v, label: v }));

const inputCls = "h-8 text-[12px] bg-white dark:bg-[#161619]";
const numCls = "h-7 text-[11px] font-mono text-right bg-white dark:bg-[#161619]";

function Field({ label, required, children, className = "" }: { label: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </Label>
      {children}
    </div>
  );
}

function SectionBox({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-[#111113]">
      <div className="bg-slate-100 dark:bg-slate-900 px-3 py-1.5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
        <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200">{title}</span>
        {action}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

const fmtMoney = (n: number | string | undefined) =>
  (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function ServiceInvoiceEditor<T extends ServiceLineItem>({
  serviceType,
  items,
  onItemsChange,
  activeIndex,
  onActiveIndexChange,
  supplierOptions,
  suppliers,
  getSupplierName,
}: Props<T>) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [fetchingRate, setFetchingRate] = useState(false);

  const label = SERVICE_LABELS[serviceType] || serviceType;
  const Icon = SERVICE_ICONS[serviceType] || Package;
  const idx = Math.min(activeIndex, Math.max(0, items.length - 1));
  const item = items[idx];

  const replaceItem = (next: T) => {
    const list = [...items];
    list[idx] = next;
    onItemsChange(list);
  };

  const recalc = (next: T, field?: string) => replaceItem(calculateServiceTotals(next, field));

  const setDetail = (field: keyof ServiceDetails, value: unknown) => {
    recalc({ ...item, service_details: { ...(item.service_details || {}), [field]: value } }, field);
  };

  const setField = (field: keyof ServiceLineItem, value: unknown) => {
    recalc({ ...item, [field]: value } as T, field);
  };

  const setPaxList = (paxList: PaxEntry[]) => recalc({ ...item, pax_list: paxList });

  async function changeCurrency(currency: string) {
    const details = { ...(item.service_details || {}), currency };
    if (currency === "PKR") {
      recalc({ ...item, service_details: { ...details, exc_rate: "1" } });
      return;
    }
    recalc({ ...item, service_details: details });
    await fetchRate(currency, details);
  }

  async function fetchRate(currency: string, details: ServiceDetails) {
    setFetchingRate(true);
    try {
      const res = await fetch(`/api/exchange-rates/latest?from=${encodeURIComponent(currency)}&to=PKR`);
      if (res.ok) {
        const data = await res.json();
        const rate = data.exchange_rate?.rate;
        if (rate) {
          recalc({ ...item, service_details: { ...details, exc_rate: String(Math.round(rate * 10000) / 10000) } });
        }
      }
    } catch (err) {
      console.error("Exchange rate fetch failed:", err);
    } finally {
      setFetchingRate(false);
    }
  }

  const addItem = () => {
    onItemsChange([...items, createDefaultServiceItem(serviceType) as T]);
    onActiveIndexChange(items.length);
  };

  const duplicateItem = () => {
    const cloned: T = JSON.parse(JSON.stringify(item));
    onItemsChange([...items, cloned]);
    onActiveIndexChange(items.length);
  };

  const removeItem = (removeIdx: number) => {
    const updated = items.filter((_, i) => i !== removeIdx);
    onItemsChange(updated);
    if (idx >= updated.length) onActiveIndexChange(Math.max(0, updated.length - 1));
  };

  if (!item) return null;

  const d = item.service_details || {};
  const currency = d.currency || "PKR";
  const isForeign = currency !== "PKR";
  const autoUpdate = item.auto_update !== false;
  const factor = getQuantityFactor(item);
  const isGeneral = !["Hotel", "Transport", "Visa"].includes(serviceType);

  const supplierField = (
    <TypeToSearch
      placeholder="Search supplier..."
      value={getSupplierName(item.supplier_id || "")}
      onChange={(val) => {
        const matched = suppliers.find((s) => s._id === val || s.name.toLowerCase() === val.trim().toLowerCase());
        setField("supplier_id", matched ? matched._id : val);
      }}
      onSelectOption={(opt) => setField("supplier_id", opt.value)}
      options={supplierOptions}
      className={inputCls}
    />
  );

  const textField = (field: keyof ServiceDetails, placeholder = "", upper = false) => (
    <Input
      placeholder={placeholder}
      value={String(d[field] ?? "")}
      onChange={(e) => setDetail(field, upper ? e.target.value.toUpperCase() : e.target.value)}
      className={`${inputCls} ${upper ? "uppercase" : ""}`}
    />
  );

  const searchField = (field: keyof ServiceDetails, options: string[], placeholder = "Search") => (
    <TypeToSearch
      placeholder={placeholder}
      value={String(d[field] ?? "")}
      onChange={(val) => setDetail(field, val)}
      onSelectOption={(opt) => setDetail(field, opt.value)}
      options={toOptions(options)}
      className={inputCls}
    />
  );

  const selectField = (field: keyof ServiceDetails, options: string[]) => (
    <Select value={String(d[field] ?? "")} onValueChange={(v) => setDetail(field, v || "")}>
      <SelectTrigger className={inputCls}>
        <SelectValue placeholder="Select">{(val) => val || "Select"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>{o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const dateField = (field: keyof ServiceDetails) => (
    <DatePicker value={String(d[field] ?? "")} onChange={(val) => setDetail(field, val)} className={inputCls} />
  );

  const currencyField = (
    <div className="flex gap-1">
      <Select value={currency} onValueChange={(v) => changeCurrency(v || "PKR")}>
        <SelectTrigger className={`${inputCls} w-[80px]`}>
          <SelectValue>{(val) => val || "PKR"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {CURRENCIES.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="relative flex-1">
        <span className="absolute left-2 top-2 text-[10px] text-slate-400">Rate</span>
        <Input
          type="number"
          value={d.exc_rate || ""}
          disabled={!isForeign}
          onChange={(e) => setDetail("exc_rate", e.target.value)}
          className={`${inputCls} pl-9 font-mono text-right`}
        />
      </div>
      {isForeign && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          title="Fetch latest exchange rate"
          disabled={fetchingRate}
          onClick={() => fetchRate(currency, d)}
        >
          {fetchingRate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      )}
    </div>
  );

  const commonTail = (
    <>
      <Field label="Category" required>{searchField("category", CATEGORIES)}</Field>
      {serviceType !== "Visa" && !isGeneral && (
        <Field label="Booking Name" required className="sm:col-span-2">{textField("booking_name", "Counter Sale")}</Field>
      )}
      <Field label="Remarks" className="sm:col-span-2">
        <Textarea
          value={d.remarks || ""}
          onChange={(e) => setDetail("remarks", e.target.value)}
          className="min-h-[56px] text-[12px] bg-white dark:bg-[#161619]"
        />
      </Field>
    </>
  );

  // ---------- Type-specific detail fields ----------
  let detailFields: ReactNode;
  if (serviceType === "Hotel") {
    detailFields = (
      <>
        <Field label="Template" required className="sm:col-span-2">{textField("template")}</Field>
        <Field label="Check-in Date" required>{dateField("check_in")}</Field>
        <Field label="Check-out Date" required>{dateField("check_out")}</Field>
        <Field label="Supplier" required>{supplierField}</Field>
        <Field label="Hotel" required>{textField("hotel_name", "Hotel name", true)}</Field>
        <Field label="City">{searchField("hotel_city", ["Makkah", "Madinah", "Jeddah", "Dubai", "Istanbul", "Baku"], "City")}</Field>
        <Field label="Room" required>{searchField("room_type", ROOM_TYPES)}</Field>
        <Field label="Room View" required>{searchField("room_view", ROOM_VIEWS)}</Field>
        <Field label="Packages">{textField("package", "e.g. BB / HB / FB")}</Field>
        <Field label="Currency" required>{currencyField}</Field>
        <Field label="Ref. Number">{textField("reference_no")}</Field>
        <Field label="Nights">
          <Input value={d.nights || "0"} readOnly className={`${inputCls} bg-slate-100 dark:bg-slate-900 font-mono`} />
        </Field>
        <Field label="Costing Option" required>{selectField("costing_option", COSTING_OPTIONS)}</Field>
        <Field label="Inventory">{textField("inventory")}</Field>
        <Field label="Room Qty" required>
          <Input type="number" min={1} value={d.room_qty || ""} onChange={(e) => setDetail("room_qty", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Extra Bed Qty">
          <Input type="number" min={0} value={d.extra_bed_qty || ""} onChange={(e) => setDetail("extra_bed_qty", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Booking Status" required>{selectField("booking_status", BOOKING_STATUSES)}</Field>
        <div className="flex items-end pb-1.5">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={d.apply_calculation !== false}
              onChange={(e) => setDetail("apply_calculation", e.target.checked)}
              className="rounded border-slate-300 h-3.5 w-3.5"
            />
            Apply Calculation
          </label>
        </div>
        {commonTail}
      </>
    );
  } else if (serviceType === "Transport") {
    detailFields = (
      <>
        <Field label="Template" required className="sm:col-span-2">{textField("template")}</Field>
        <Field label="Supplier" required>{supplierField}</Field>
        <Field label="Transporter" required>{textField("transporter", "Transport company")}</Field>
        <Field label="Vehicle" required>{searchField("vehicle", VEHICLES)}</Field>
        <Field label="Sector">{searchField("sector", TRANSPORT_SECTORS)}</Field>
        <Field label="Package">{textField("package")}</Field>
        <Field label="Inventory">{textField("inventory")}</Field>
        <Field label="Currency" required>{currencyField}</Field>
        <Field label="Reference No.">{textField("reference_no")}</Field>
        {commonTail}
      </>
    );
  } else if (serviceType === "Visa") {
    detailFields = (
      <>
        <Field label="Template" required className="sm:col-span-2">{textField("template")}</Field>
        <Field label="Pax Type" required>
          <Select value={d.visa_pax_type || "A"} onValueChange={(v) => setDetail("visa_pax_type", v || "A")}>
            <SelectTrigger className={inputCls}>
              <SelectValue>{(val) => (val === "C" ? "Child (C)" : val === "I" ? "Infant (I)" : "Adult (A)")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A">Adult (A)</SelectItem>
              <SelectItem value="C">Child (C)</SelectItem>
              <SelectItem value="I">Infant (I)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Supplier" required>{supplierField}</Field>
        <Field label="Visa Agency" required>{textField("visa_agency", "Visa agency")}</Field>
        <Field label="Visa Type">{searchField("visa_type", VISA_TYPES)}</Field>
        <Field label="Visa Apply Date">{dateField("visa_apply_date")}</Field>
        <Field label="Visa Expiry Date">{dateField("visa_expiry_date")}</Field>
        <Field label="Currency" required>{currencyField}</Field>
        <Field label="Reference No.">{textField("reference_no")}</Field>
        <div className="flex items-end pb-1.5">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={d.apply_calculation !== false}
              onChange={(e) => setDetail("apply_calculation", e.target.checked)}
              className="rounded border-slate-300 h-3.5 w-3.5"
            />
            Rate per Pax
          </label>
        </div>
        {commonTail}
      </>
    );
  } else {
    detailFields = (
      <>
        <Field label="Template / Service" required className="sm:col-span-2">{searchField("template", GENERAL_TEMPLATES)}</Field>
        <Field label="Supplier" required>{supplierField}</Field>
        <Field label="Vendor" required>{textField("vendor", "Vendor")}</Field>
        <Field label="Date" required>{dateField("service_date")}</Field>
        <Field label="Reference No.">{textField("reference_no")}</Field>
        {commonTail}
      </>
    );
  }

  // ---------- Pax grid ----------
  const paxList = item.pax_list && item.pax_list.length > 0 ? item.pax_list : [{ name: "", pax_type: "A" }];
  const paxGrid = (
    <SectionBox
      title={`Pax (${paxList.filter((p) => p.name.trim()).length})${isGeneral ? " *" : ""}`}
      action={
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 text-[10px] px-2 gap-1 bg-white dark:bg-slate-800"
          onClick={() => setPaxList([...paxList, { name: "", pax_type: "A" }])}
        >
          <Plus className="h-2.5 w-2.5" /> Add Pax
        </Button>
      }
    >
      <table className="w-full text-[11px]">
        <thead className="text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
          <tr>
            <th className="p-1 text-left w-8">#</th>
            <th className="p-1 text-left">Name</th>
            <th className="p-1 text-left w-[120px]">Pax Type</th>
            <th className="p-1 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {paxList.map((p, pIdx) => (
            <tr key={pIdx} className="border-b border-slate-100 dark:border-slate-800/60">
              <td className="p-1 text-slate-400">{pIdx + 1}</td>
              <td className="p-1">
                <Input
                  placeholder="MR. First Name Last Name"
                  value={p.name}
                  onChange={(e) => {
                    const next = [...paxList];
                    next[pIdx] = { ...p, name: e.target.value.toUpperCase() };
                    setPaxList(next);
                  }}
                  className="h-7 text-[11px] uppercase font-semibold bg-transparent"
                />
              </td>
              <td className="p-1">
                <Select
                  value={p.pax_type || "A"}
                  onValueChange={(v) => {
                    const next = [...paxList];
                    next[pIdx] = { ...p, pax_type: v || "A" };
                    setPaxList(next);
                  }}
                >
                  <SelectTrigger className="h-7 text-[11px]">
                    <SelectValue>{(val) => (val === "C" ? "Child (C)" : val === "I" ? "Infant (I)" : "Adult (A)")}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">Adult (A)</SelectItem>
                    <SelectItem value="C">Child (C)</SelectItem>
                    <SelectItem value="I">Infant (I)</SelectItem>
                  </SelectContent>
                </Select>
              </td>
              <td className="p-1 text-center">
                {paxList.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setPaxList(paxList.filter((_, i) => i !== pIdx))}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionBox>
  );

  // ---------- Charges ----------
  const qtyHint =
    serviceType === "Hotel"
      ? d.apply_calculation === false
        ? "Total amount"
        : d.costing_option === "Lump Sum"
          ? "Lump sum"
          : d.costing_option === "Per Person / Night"
            ? `× ${d.nights || 0} night(s) × ${paxCount(item)} pax`
            : `× ${d.nights || 0} night(s) × ${d.room_qty || 1} room(s)`
      : serviceType === "Visa" && d.apply_calculation !== false
        ? `× ${factor} pax`
        : "";

  const rateRow = (title: string, field: "receivable_rate" | "payable_rate", totalFc: number | undefined, totalLc: string | undefined) => (
    <tr className="divide-x divide-slate-200 dark:divide-slate-800">
      <td className="py-0.5 px-1.5 font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40">{title}</td>
      <td className="p-0.5">
        <Input type="number" placeholder="0.00" value={d[field] || ""} onChange={(e) => setDetail(field, e.target.value)} className={numCls} />
      </td>
      <td className="p-0.5 text-center text-[10px] text-slate-500">{factor}</td>
      {isForeign && <td className="py-0.5 px-1.5 text-right font-mono text-[11px]">{fmtMoney(totalFc)}</td>}
      <td className="py-0.5 px-1.5 text-right font-mono text-[11px] font-semibold">{fmtMoney(totalLc)}</td>
    </tr>
  );

  const charges = (
    <SectionBox title="Charges">
      <div className="space-y-3">
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded">
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                <th className="py-1 px-1.5 text-left">{isGeneral ? "Service Charges" : "Charges"}</th>
                <th className="py-1 px-1.5 text-right">Rate ({currency})</th>
                <th className="py-1 px-1 text-center">Qty</th>
                {isForeign && <th className="py-1 px-1.5 text-right">F. Currency</th>}
                <th className="py-1 px-1.5 text-right">L. Currency (PKR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {rateRow("Receivable", "receivable_rate", d.receivable_total_fc, d.receivable_total_lc)}
              {rateRow("Payable", "payable_rate", d.payable_total_fc, d.payable_total_lc)}
            </tbody>
          </table>
        </div>
        {qtyHint && <p className="text-[10px] text-slate-500 -mt-2">Rate {qtyHint}</p>}

        {serviceType === "Hotel" && (
          <div className="grid grid-cols-2 gap-2">
            <Field label={`Extra Bed Rec. Rate (${currency})`}>
              <Input type="number" value={d.extra_bed_receivable_rate || ""} onChange={(e) => setDetail("extra_bed_receivable_rate", e.target.value)} className={numCls} />
            </Field>
            <Field label={`Extra Bed Pay. Rate (${currency})`}>
              <Input type="number" value={d.extra_bed_payable_rate || ""} onChange={(e) => setDetail("extra_bed_payable_rate", e.target.value)} className={numCls} />
            </Field>
          </div>
        )}

        <div>
          <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">Other Charges / Discount (PKR)</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Other Charges">
              <Input type="number" value={d.other_charges || ""} onChange={(e) => setDetail("other_charges", e.target.value)} className={numCls} />
            </Field>
            <Field label="Discount">
              <Input type="number" value={d.discount || ""} onChange={(e) => setDetail("discount", e.target.value)} className={numCls} />
            </Field>
          </div>
        </div>

        {isGeneral && (
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded">
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                  <th className="py-1 px-1.5 text-left">Field</th>
                  <th className="py-1 px-1 text-center">%</th>
                  <th className="py-1 px-1.5 text-right">Amount</th>
                  <th className="py-1 px-1.5 text-left">Field</th>
                  <th className="py-1 px-1 text-center">%</th>
                  <th className="py-1 px-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="divide-x divide-slate-200 dark:divide-slate-800">
                  <td className="py-0.5 px-1.5 font-bold text-slate-600 bg-slate-50 dark:bg-slate-900/40">COM2</td>
                  <td className="p-0.5"><Input type="number" value={d.com2_percent || ""} onChange={(e) => setDetail("com2_percent", e.target.value)} className={`${numCls} text-center`} /></td>
                  <td className="p-0.5"><Input type="number" value={d.com2_amount || ""} onChange={(e) => setDetail("com2_amount", e.target.value)} className={numCls} /></td>
                  <td className="py-0.5 px-1.5 font-bold text-slate-600 bg-slate-50 dark:bg-slate-900/40">WHT</td>
                  <td className="p-0.5"><Input type="number" value={d.wht_percent || ""} onChange={(e) => setDetail("wht_percent", e.target.value)} className={`${numCls} text-center`} /></td>
                  <td className="p-0.5"><Input type="number" value={d.wht_amount || ""} onChange={(e) => setDetail("wht_amount", e.target.value)} className={numCls} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={autoUpdate}
            onChange={(e) => setField("auto_update", e.target.checked)}
            className="rounded border-slate-300 h-3.5 w-3.5"
          />
          Auto Update
          {!autoUpdate && <span className="font-normal text-slate-500">(enter net totals manually)</span>}
        </label>

        <div>
          <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">Net Total (Local Currency)</p>
          <table className="w-full text-[11px] border border-slate-200 dark:border-slate-800">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-bold">
                <th className="py-1 px-1.5 text-left">Receivable</th>
                <th className="py-1 px-1.5 text-left">Payable</th>
                <th className="py-1 px-1.5 text-left">Difference</th>
              </tr>
            </thead>
            <tbody>
              <tr className="divide-x divide-slate-200 dark:divide-slate-800">
                <td className="p-0.5">
                  {autoUpdate ? (
                    <span className="block px-1 font-mono">{fmtMoney(item.customer_net)}</span>
                  ) : (
                    <Input type="number" value={d.receivable_total_lc || ""} onChange={(e) => setDetail("receivable_total_lc", e.target.value)} className={numCls} />
                  )}
                </td>
                <td className="p-0.5">
                  {autoUpdate ? (
                    <span className="block px-1 font-mono">{fmtMoney(item.supplier_net)}</span>
                  ) : (
                    <Input type="number" value={d.payable_total_lc || ""} onChange={(e) => setDetail("payable_total_lc", e.target.value)} className={numCls} />
                  )}
                </td>
                <td className={`p-0.5 px-1 font-mono font-bold ${(item.agency_margin || 0) < 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {fmtMoney(item.agency_margin)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </SectionBox>
  );

  const totals = (
    <div className="p-3 bg-slate-900 text-white rounded-lg font-mono text-[11px] space-y-1 shadow">
      <div className="grid grid-cols-2 gap-x-4 border-b border-slate-800 pb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
        <span>Totals</span>
        <span className="text-right">PKR</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 pt-1">
        <div className="flex justify-between text-emerald-400 font-bold"><span>Customer Net:</span><span>{fmtMoney(item.customer_net)}</span></div>
        <div className="flex justify-between text-amber-400 font-bold"><span>Supplier Net:</span><span>{fmtMoney(item.supplier_net)}</span></div>
      </div>
      <div className="grid grid-cols-2 gap-x-4">
        <div className="flex justify-between text-slate-400 text-[10px]"><span>Invoice Rec. Gross:</span><span>{fmtMoney(item.customer_gross)}</span></div>
        <div className="flex justify-between text-slate-400 text-[10px]"><span>Invoice Pay. Gross:</span><span>{fmtMoney(item.supplier_gross)}</span></div>
      </div>
      <div className="grid grid-cols-2 gap-x-4">
        <div className="flex justify-between text-slate-300 text-[10px]"><span>Invoice Rec. Net:</span><span>{fmtMoney(item.customer_net)}</span></div>
        <div className="flex justify-between text-slate-300 text-[10px]"><span>Invoice Pay. Net:</span><span>{fmtMoney(item.supplier_net)}</span></div>
      </div>
      <div className="flex justify-between border-t border-slate-800 pt-1">
        <span className="text-slate-400 uppercase font-bold text-[10px]">Agency Profit:</span>
        <span className="font-bold text-blue-400 text-[12px]">{fmtMoney(item.agency_margin)}</span>
      </div>
    </div>
  );

  const itemTitle = (li: ServiceLineItem, i: number) => {
    const ld = li.service_details || {};
    if (li.service_type === "Hotel" && ld.hotel_name) return ld.hotel_name;
    if (li.service_type === "Transport" && ld.vehicle) return ld.vehicle;
    if (li.service_type === "Visa" && ld.visa_type) return ld.visa_type;
    if (li.pax_name) return li.pax_name;
    return `${label}-${i + 1}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row gap-3 items-start">
        {/* Left sidebar: list of service items */}
        <div
          className={`flex-shrink-0 bg-slate-50 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 transition-all duration-300 ${
            sidebarCollapsed ? "w-full md:w-14" : "w-full md:w-52"
          }`}
        >
          <div className={`flex items-center ${sidebarCollapsed ? "flex-col gap-1 pb-2" : "justify-between px-1 py-1"} border-b border-slate-200 dark:border-slate-800`}>
            {!sidebarCollapsed && (
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 truncate">
                <Icon className="h-3.5 w-3.5 text-primary flex-shrink-0" /> {label} ({items.length})
              </span>
            )}
            <div className={`flex items-center gap-0.5 ${sidebarCollapsed ? "flex-col" : ""}`}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600"
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              >
                {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-3.5 w-3.5" />}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-primary" title={`Add ${label}`} onClick={addItem}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5 max-h-[550px] overflow-y-auto pr-0.5">
            {items.map((li, i) => {
              const isSelected = idx === i;
              if (sidebarCollapsed) {
                return (
                  <div
                    key={i}
                    onClick={() => onActiveIndexChange(i)}
                    title={itemTitle(li, i)}
                    className={`h-9 w-9 rounded-xl flex items-center justify-center text-xs font-extrabold cursor-pointer mx-auto border ${
                      isSelected
                        ? "bg-blue-600 text-white border-blue-500 shadow-md"
                        : "bg-white dark:bg-slate-800/80 hover:bg-slate-100 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {i + 1}
                  </div>
                );
              }
              return (
                <div
                  key={i}
                  onClick={() => onActiveIndexChange(i)}
                  className={`group relative flex items-center justify-between p-2.5 rounded-xl text-xs cursor-pointer transition-all border ${
                    isSelected
                      ? "bg-blue-600 text-white border-blue-600 shadow-md font-semibold"
                      : "bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700/70 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700/80"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${isSelected ? "bg-white/20" : "bg-slate-200 dark:bg-slate-700"}`}>
                      {i + 1}
                    </span>
                    <div className="truncate min-w-0">
                      <p className="truncate text-[11.5px] leading-tight font-bold">{itemTitle(li, i)}</p>
                      <p className={`text-[9.5px] truncate font-mono mt-0.5 ${isSelected ? "text-white/80" : "text-slate-400"}`}>
                        PKR {fmtMoney(li.customer_net)}
                      </p>
                    </div>
                  </div>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeItem(i);
                      }}
                      className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${isSelected ? "hover:bg-white/20" : "hover:bg-red-100 text-slate-400 hover:text-red-600"}`}
                      title={`Delete ${label}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {!sidebarCollapsed && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs gap-1.5 border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161619] hover:bg-primary/5 hover:border-primary"
              onClick={addItem}
            >
              <Plus className="h-3.5 w-3.5" /> Add {label}
            </Button>
          )}
        </div>

        {/* Right: active item form */}
        <div className="flex-1 min-w-0 w-full">
          <div className="space-y-3 text-[12px] bg-slate-50/50 dark:bg-[#0c0c0e] p-1.5 md:p-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-inner">
            <div className="flex items-center justify-between px-1">
              <span className="font-bold text-[13px] text-primary flex items-center gap-1.5">
                <Icon className="h-4 w-4" /> {label} Invoice : {label}-{idx + 1}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[11px] font-semibold gap-1 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                onClick={duplicateItem}
              >
                <Copy className="h-3 w-3" /> Duplicate
              </Button>
            </div>

            <div className="flex flex-col lg:flex-row gap-3">
              <div className="w-full lg:w-[58%] space-y-3">
                <div className="p-3 bg-white dark:bg-[#111113] rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2.5">{detailFields}</div>
                </div>
                {paxGrid}
              </div>
              <div className="w-full lg:w-[42%] space-y-3">
                {charges}
                {totals}
              </div>
            </div>
          </div>
        </div>
      </div>

      {items.length > 1 && (
        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs font-semibold">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
            <Layers className="h-4 w-4" />
            <span>Combined Invoice: <strong>{items.length} {label} items</strong></span>
          </div>
          <div className="flex items-center gap-4 font-mono">
            <span>Grand Total Due: <strong className="text-primary text-sm">PKR {fmtMoney(items.reduce((s, li) => s + (li.customer_net || 0), 0))}</strong></span>
            <span>Total Agency Margin: <strong className="text-blue-600 dark:text-blue-400">PKR {fmtMoney(items.reduce((s, li) => s + (li.agency_margin || 0), 0))}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}
