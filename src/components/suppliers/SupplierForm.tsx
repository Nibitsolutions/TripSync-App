"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, MapPin, UserCheck, Check, Plus, Trash2, Plane, Hotel, Bus, Stamp, Layers, Landmark } from "lucide-react";

export interface SupplierContactPerson {
  name: string;
  designation: string;
  cell_phone: string;
  phone: string;
  fax: string;
  email: string;
}

export interface SupplierVendor {
  category: string;
  title: string;
  details: string;
}

export interface SupplierRecord {
  _id: string;
  code: string;
  name: string;
  short_name?: string;
  details?: string;
  business_email?: string;

  gl_account?: string;
  credit_limit?: number | null;
  create_auto_ledger?: boolean;
  visible_to_all_branches?: boolean;
  add_all_vendors?: boolean;
  currency: string;

  address_1?: string;
  address_2?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  city?: string;
  phone_1?: string;
  phone_2?: string;
  fax?: string;

  contact_persons?: SupplierContactPerson[];
  vendors?: SupplierVendor[];

  contact_email?: string;
  contact_phone?: string;
  current_balance: number;
}

export const VENDOR_CATEGORIES = [
  { value: "Airline", icon: Plane },
  { value: "Hotel", icon: Hotel },
  { value: "Transport", icon: Bus },
  { value: "Visa Agency", icon: Stamp },
  { value: "General", icon: Layers },
] as const;

const CURRENCIES = ["PKR", "USD", "GBP", "SAR", "AED"];

const emptyContact: SupplierContactPerson = { name: "", designation: "", cell_phone: "", phone: "", fax: "", email: "" };

interface SupplierFormProps {
  /** Supplier being edited; omit to create a new one. */
  editSupplier?: SupplierRecord | null;
  onSaved: (supplier: SupplierRecord) => void;
  onCancel: () => void;
}

/**
 * Supplier create/edit form, laid out like the customer form: a General Information tab
 * (details, Account Information and the Airline / Hotel / Transport / Visa Agency / General
 * vendor tabs) and an Address & Contact tab. Remount it (via `key`) to reset its state.
 */
export function SupplierForm({ editSupplier, onSaved, onCancel }: SupplierFormProps) {
  const s = editSupplier;
  const editId = s?._id || null;

  const [activeTab, setActiveTab] = useState("general");
  const [activeVendorTab, setActiveVendorTab] = useState<string>("Airline");

  // General Information
  const [code, setCode] = useState(s?.code || "");
  const [name, setName] = useState(s?.name || "");
  const [shortName, setShortName] = useState(s?.short_name || "");
  const [details, setDetails] = useState(s?.details || "");
  const [businessEmail, setBusinessEmail] = useState(s?.business_email || s?.contact_email || "");

  // Account Information
  const [glAccount, setGlAccount] = useState(s?.gl_account || "201001");
  const [creditLimit, setCreditLimit] = useState(s?.credit_limit !== null && s?.credit_limit !== undefined ? String(s.credit_limit) : "");
  const [createAutoLedger, setCreateAutoLedger] = useState(s?.create_auto_ledger !== undefined ? s.create_auto_ledger : true);
  const [visibleToAllBranches, setVisibleToAllBranches] = useState(s?.visible_to_all_branches !== undefined ? s.visible_to_all_branches : true);
  const [addAllVendors, setAddAllVendors] = useState(s?.add_all_vendors || false);
  const [currency, setCurrency] = useState(s?.currency || "PKR");

  // Address
  const [address1, setAddress1] = useState(s?.address_1 || "");
  const [address2, setAddress2] = useState(s?.address_2 || "");
  const [state, setState] = useState(s?.state || "");
  const [zipCode, setZipCode] = useState(s?.zip_code || "");
  const [country, setCountry] = useState(s?.country || "Pakistan");
  const [city, setCity] = useState(s?.city || "");
  const [mobile1, setMobile1] = useState(s?.phone_1 || s?.contact_phone || "");
  const [mobile2, setMobile2] = useState(s?.phone_2 || "");

  // Contact Person — the form edits the main (first) contact; any further contacts saved
  // on older suppliers are kept as they are.
  const [contact, setContact] = useState<SupplierContactPerson>({ ...emptyContact, ...s?.contact_persons?.[0] });
  const otherContacts = s?.contact_persons?.slice(1) || [];

  // Vendors
  const [vendors, setVendors] = useState<SupplierVendor[]>(s?.vendors || []);
  const [vendorTitle, setVendorTitle] = useState("");
  const [vendorDetails, setVendorDetails] = useState("");

  const [saving, setSaving] = useState(false);

  function addVendor() {
    if (!vendorTitle.trim()) return;
    setVendors((prev) => [...prev, { category: activeVendorTab, title: vendorTitle.trim(), details: vendorDetails.trim() }]);
    setVendorTitle("");
    setVendorDetails("");
  }

  async function handleSave() {
    // Required fields (*): Code*, Title*, GL Account*
    const missing: string[] = [];
    if (!code.trim()) missing.push("Code (*)");
    if (!name.trim()) missing.push("Title (*)");
    if (!glAccount.trim()) missing.push("GL Account (*)");
    const hasContact = Object.values(contact).some((v) => v.trim());
    if (hasContact && !contact.name.trim()) missing.push("Contact Person Name");

    if (missing.length > 0) {
      alert(`Cannot save supplier. Please fill in all required (*) fields:\n\n• ${missing.join("\n• ")}`);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        code: code.trim(),
        name: name.trim(),
        short_name: shortName.trim(),
        details: details.trim(),
        business_email: businessEmail.trim(),
        gl_account: glAccount.trim(),
        credit_limit: creditLimit ? parseFloat(creditLimit) : null,
        create_auto_ledger: createAutoLedger,
        visible_to_all_branches: visibleToAllBranches,
        add_all_vendors: addAllVendors,
        currency,
        address_1: address1.trim(),
        address_2: address2.trim(),
        state: state.trim(),
        zip_code: zipCode.trim(),
        country: country.trim(),
        city: city.trim(),
        phone_1: mobile1.trim(),
        phone_2: mobile2.trim(),
        fax: s?.fax || "",
        contact_persons: [contact, ...otherContacts],
        vendors,
      };

      const res = await fetch(editId ? `/api/suppliers/${editId}` : "/api/suppliers", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));

      if (res.ok) {
        onSaved((d.supplier || { ...payload, _id: editId || "" }) as SupplierRecord);
      } else {
        alert(d.error || "Failed to save supplier");
      }
    } catch (err) {
      console.error(err);
      alert("An unexpected error occurred while saving supplier.");
    } finally {
      setSaving(false);
    }
  }

  const labelClass = "text-[12px] font-semibold text-slate-700 dark:text-slate-300";
  const inputClass = "h-9 text-[13px] bg-white dark:bg-[#111113]";
  const groupClass = "p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#141416] space-y-4";
  const headClass = "text-xs font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-1.5";
  const req = <span className="text-red-500 font-bold">*</span>;
  const tabVendors = vendors.map((v, i) => ({ ...v, i })).filter((v) => v.category === activeVendorTab);

  const textField = (label: string, value: string, onChange: (v: string) => void, placeholder: string, opts: { required?: boolean; type?: string; mono?: boolean } = {}) => (
    <div className="space-y-1.5">
      <Label className={`${labelClass} flex items-center gap-1`}>{label} {opts.required && req}</Label>
      <Input
        type={opts.type || "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputClass} ${opts.mono ? "font-mono" : ""}`}
      />
    </div>
  );
  const setContactField = (key: keyof SupplierContactPerson) => (v: string) => setContact((c) => ({ ...c, [key]: v }));

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 w-full max-w-sm mb-6 bg-slate-100 dark:bg-[#18181b] p-1 rounded-xl">
          <TabsTrigger value="general" className="text-xs font-semibold gap-1.5 py-2">
            <Building2 className="h-3.5 w-3.5 text-primary" /> General Information
          </TabsTrigger>
          <TabsTrigger value="address" className="text-xs font-semibold gap-1.5 py-2">
            <MapPin className="h-3.5 w-3.5 text-emerald-500" /> Address &amp; Contact
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: General Information — details, Account Information, vendors */}
        <TabsContent value="general" className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {textField("Code", code, (v) => setCode(v.toUpperCase()), "e.g. BSP", { required: true, mono: true })}
            {textField("Title", name, setName, "e.g. Billing and Settlement Plan", { required: true })}
            {textField("Short Name", shortName, setShortName, "Short abbreviation")}
            {textField("Business Email", businessEmail, setBusinessEmail, "accounts@supplier.com", { type: "email" })}
            <div className="space-y-1.5 sm:col-span-2">
              <Label className={labelClass}>Details</Label>
              <Textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Additional details / supplier notes..."
                className="min-h-[42px] text-[13px] bg-white dark:bg-[#111113]"
              />
            </div>
          </div>

          {/* Account Information */}
          <div className={groupClass}>
            <h3 className={`${headClass} text-emerald-600`}>
              <Landmark className="h-4 w-4" /> Account Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_160px] gap-4">
              {textField("GL Account", glAccount, setGlAccount, "201001", { required: true, mono: true })}
              {textField("Credit Limit", creditLimit, setCreditLimit, "0 (Unlimited)", { type: "number", mono: true })}
              <div className="space-y-1.5">
                <Label className={labelClass}>Currency</Label>
                <Select value={currency} onValueChange={(v) => v && setCurrency(v)}>
                  <SelectTrigger className="h-9 w-full text-[13px] bg-white dark:bg-[#111113]"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {([
                ["Create Auto Ledger Account", createAutoLedger, setCreateAutoLedger],
                ["Visible To All Branches", visibleToAllBranches, setVisibleToAllBranches],
                ["Add all Vendors", addAllVendors, setAddAllVendors],
              ] as [string, boolean, (v: boolean) => void][]).map(([label, checked, setter]) => (
                <label key={label} className="flex items-center gap-2.5 cursor-pointer text-[12px] font-medium text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setter(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Vendors: Airline / Hotel / Transport / Visa Agency / General */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#141416]">
            <Tabs value={activeVendorTab} onValueChange={(v) => setActiveVendorTab(String(v))}>
              <TabsList className="grid grid-cols-5 w-full max-w-2xl mb-4 bg-slate-100 dark:bg-[#18181b] p-1 rounded-xl">
                {VENDOR_CATEGORIES.map(({ value, icon: Icon }) => {
                  const count = vendors.filter((v) => v.category === value).length;
                  return (
                    <TabsTrigger key={value} value={value} className="text-xs font-semibold gap-1.5 py-2">
                      <Icon className="h-3.5 w-3.5" /> {value}{count > 0 ? ` (${count})` : ""}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>

            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113]">
              <table className="w-full text-[12px]">
                <thead className="bg-slate-50 dark:bg-[#161618] text-slate-500 font-semibold">
                  <tr>
                    <th className="text-left px-3 py-2 w-2/5">Title</th>
                    <th className="text-left px-3 py-2">Details</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {tabVendors.length === 0 && (
                    <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-400">No {activeVendorTab} vendors linked.</td></tr>
                  )}
                  {tabVendors.map((v) => (
                    <tr key={v.i} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{v.title}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{v.details}</td>
                      <td className="px-2 py-2 text-right">
                        <button type="button" onClick={() => setVendors((prev) => prev.filter((_, i) => i !== v.i))} className="text-slate-400 hover:text-red-500" title="Remove">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-[#141416]">
                    <td className="px-2 py-1.5">
                      <Input
                        value={vendorTitle}
                        onChange={(e) => setVendorTitle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVendor(); } }}
                        placeholder={`${activeVendorTab} vendor title`}
                        className="h-8 text-[12px]"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={vendorDetails}
                        onChange={(e) => setVendorDetails(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVendor(); } }}
                        placeholder="Details"
                        className="h-8 text-[12px]"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <Button type="button" size="sm" variant="outline" className="h-8 w-8 p-0" onClick={addVendor} disabled={!vendorTitle.trim()} title="Add vendor">
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Address & Contact */}
        <TabsContent value="address" className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {textField("Address 1", address1, setAddress1, "Street address 1")}
            {textField("Address 2", address2, setAddress2, "Street address 2")}
            {textField("City", city, setCity, "City")}
            {textField("State", state, setState, "State / Province")}
            {textField("Zip / Postal Code", zipCode, setZipCode, "Postal code")}
            {textField("Country", country, setCountry, "Pakistan")}
            {textField("Mobile Number 1", mobile1, setMobile1, "Main mobile number")}
            {textField("Mobile Number 2", mobile2, setMobile2, "Secondary mobile number")}
          </div>

          <div className={groupClass}>
            <h3 className={`${headClass} text-blue-600`}>
              <UserCheck className="h-4 w-4" /> Contact Person
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {textField("Contact Person Name", contact.name, setContactField("name"), "Full contact person name")}
              {textField("Designation / Title", contact.designation, setContactField("designation"), "e.g. Accounts Manager")}
              {textField("Mobile / Phone", contact.cell_phone, setContactField("cell_phone"), "Mobile or direct line")}
              {textField("Email Address", contact.email, setContactField("email"), "contact@supplier.com", { type: "email" })}
            </div>
            {otherContacts.length > 0 && (
              <p className="text-[11px] text-slate-400">
                {otherContacts.length} more contact {otherContacts.length === 1 ? "person is" : "persons are"} saved on this supplier and kept unchanged.
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Action Bar */}
      <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-800 mt-6">
        <span className="text-[11px] text-slate-400">
          Fields marked with <span className="text-red-500 font-bold">*</span> are compulsory.
        </span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2 bg-primary hover:bg-primary/90">
            <Check className="h-4 w-4" />
            {saving ? "Saving..." : editId ? "Update Supplier" : "Save Supplier"}
          </Button>
        </div>
      </div>
    </>
  );
}
