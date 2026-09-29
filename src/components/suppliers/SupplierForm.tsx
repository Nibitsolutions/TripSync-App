"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, MapPin, UserCheck, Check, Plus, Pencil, Trash2, Plane, Hotel, Bus, Stamp, Layers } from "lucide-react";

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
 * Full supplier create/edit form, laid out like the customer form:
 * General Information / Address / Contact Person tabs, Account Information,
 * and the Airline / Hotel / Transport / Visa Agency / General vendor tabs.
 * Remount it (via `key`) to reset its state.
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
  const [phone1, setPhone1] = useState(s?.phone_1 || s?.contact_phone || "");
  const [phone2, setPhone2] = useState(s?.phone_2 || "");
  const [fax, setFax] = useState(s?.fax || "");

  // Contact Persons (older suppliers only had a single contact email/phone)
  const [contacts, setContacts] = useState<SupplierContactPerson[]>(() => {
    if (s?.contact_persons?.length) return s.contact_persons.map((c) => ({ ...emptyContact, ...c }));
    return [];
  });
  const [contactDialog, setContactDialog] = useState<{ index: number | null; data: SupplierContactPerson } | null>(null);
  const [selectedContact, setSelectedContact] = useState<number | null>(null);

  // Vendors
  const [vendors, setVendors] = useState<SupplierVendor[]>(s?.vendors || []);
  const [vendorTitle, setVendorTitle] = useState("");
  const [vendorDetails, setVendorDetails] = useState("");

  const [saving, setSaving] = useState(false);

  function saveContact() {
    if (!contactDialog) return;
    const d = contactDialog.data;
    const missing: string[] = [];
    if (!d.name.trim()) missing.push("Name (*)");
    if (!d.designation.trim()) missing.push("Designation (*)");
    if (missing.length) {
      alert(`Please fill in the required contact person fields:\n\n• ${missing.join("\n• ")}`);
      return;
    }
    setContacts((prev) => {
      if (contactDialog.index === null) return [...prev, d];
      return prev.map((c, i) => (i === contactDialog.index ? d : c));
    });
    setContactDialog(null);
  }

  function removeContact() {
    if (selectedContact === null) return;
    setContacts((prev) => prev.filter((_, i) => i !== selectedContact));
    setSelectedContact(null);
  }

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
        phone_1: phone1.trim(),
        phone_2: phone2.trim(),
        fax: fax.trim(),
        contact_persons: contacts,
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
  const req = <span className="text-red-500 font-bold">*</span>;
  const tabVendors = vendors.map((v, i) => ({ ...v, i })).filter((v) => v.category === activeVendorTab);

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-md mb-6 bg-slate-100 dark:bg-[#18181b] p-1 rounded-xl">
          <TabsTrigger value="general" className="text-xs font-semibold gap-1.5 py-2">
            <Building2 className="h-3.5 w-3.5 text-primary" /> General Information
          </TabsTrigger>
          <TabsTrigger value="address" className="text-xs font-semibold gap-1.5 py-2">
            <MapPin className="h-3.5 w-3.5 text-emerald-500" /> Address
          </TabsTrigger>
          <TabsTrigger value="contact" className="text-xs font-semibold gap-1.5 py-2">
            <UserCheck className="h-3.5 w-3.5 text-blue-500" /> Contact Person
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: General Information — Code, Title, Short Name, Details */}
        <TabsContent value="general">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#141416] grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className={`${labelClass} flex items-center gap-1`}>Code {req}</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. BSP"
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div className="space-y-1.5">
                <Label className={labelClass}>Short Name</Label>
                <Input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="Short Abbreviation" className={inputClass} />
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className={`${labelClass} flex items-center gap-1`}>Title {req}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Billing and Settlement Plan" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <Label className={labelClass}>Details</Label>
                <Textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Additional details / supplier notes..."
                  className="min-h-[38px] h-9 text-[13px] bg-white dark:bg-[#111113]"
                />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Address */}
        <TabsContent value="address">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#141416] grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              ["Address 1", address1, setAddress1, "Street address 1"],
              ["Address 2", address2, setAddress2, "Street address 2"],
              ["State", state, setState, "State / Province"],
              ["Zip/Postal Code", zipCode, setZipCode, "Postal code"],
              ["Country", country, setCountry, "Pakistan"],
              ["City", city, setCity, "City"],
              ["Phone 1", phone1, setPhone1, "Main telephone number"],
              ["Phone 2", phone2, setPhone2, "Secondary phone"],
              ["Fax", fax, setFax, "Fax number"],
            ].map(([label, value, setter, placeholder]) => (
              <div key={label as string} className="space-y-1.5">
                <Label className={labelClass}>{label as string}</Label>
                <Input
                  value={value as string}
                  onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                  placeholder={placeholder as string}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Tab 3: Contact Person — list with add / edit / remove */}
        <TabsContent value="contact">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#141416] space-y-3">
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113]">
              <table className="w-full text-[12px]">
                <thead className="bg-slate-50 dark:bg-[#161618] text-slate-500 font-semibold">
                  <tr>
                    <th className="text-left px-3 py-2">Name</th>
                    <th className="text-left px-3 py-2">Designation</th>
                    <th className="text-left px-3 py-2">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.length === 0 ? (
                    <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-400">No contact persons added.</td></tr>
                  ) : contacts.map((c, i) => (
                    <tr
                      key={i}
                      onClick={() => setSelectedContact(i)}
                      onDoubleClick={() => setContactDialog({ index: i, data: { ...c } })}
                      className={`border-t border-slate-100 dark:border-slate-800 cursor-pointer ${selectedContact === i ? "bg-primary/10" : "hover:bg-slate-50 dark:hover:bg-[#18181b]"}`}
                    >
                      <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{c.name}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{c.designation}</td>
                      <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">{c.cell_phone || c.phone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setContactDialog({ index: null, data: { ...emptyContact } })}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
              <Button
                type="button" size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={selectedContact === null}
                onClick={() => selectedContact !== null && setContactDialog({ index: selectedContact, data: { ...contacts[selectedContact] } })}
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs gap-1 text-red-600" disabled={selectedContact === null} onClick={removeContact}>
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Account Information */}
      <div className="mt-6 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113] shadow-sm space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-1.5">
          <Building2 className="h-4 w-4" /> Account Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold flex items-center gap-1 text-slate-600 dark:text-slate-400">GL Account {req}</Label>
            <Input value={glAccount} onChange={(e) => setGlAccount(e.target.value)} placeholder="201001 - Trade Creditors" className="h-8 font-mono text-[12px]" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Credit Limit</Label>
            <Input type="number" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="0 (Unlimited)" className="h-8 font-mono text-[12px]" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Currency</Label>
            <Select value={currency} onValueChange={(v) => v && setCurrency(v)}>
              <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
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
      <div className="mt-6 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113] shadow-sm">
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

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
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

      {/* Contact Person Details pop-up */}
      <Dialog open={!!contactDialog} onOpenChange={(open) => { if (!open) setContactDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Contact Person Details</DialogTitle>
          </DialogHeader>
          {contactDialog && (
            <div className="space-y-3">
              {([
                ["name", "Name", true, "text"],
                ["designation", "Designation", true, "text"],
                ["cell_phone", "Cell Phone", false, "text"],
                ["phone", "Phone", false, "text"],
                ["fax", "Fax", false, "text"],
                ["email", "Email", false, "email"],
              ] as [keyof SupplierContactPerson, string, boolean, string][]).map(([key, label, required, type]) => (
                <div key={key} className="grid grid-cols-[110px_1fr] items-center gap-3">
                  <Label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    {label} {required && req}
                  </Label>
                  <Input
                    type={type}
                    value={contactDialog.data[key]}
                    onChange={(e) => setContactDialog((prev) => prev && { ...prev, data: { ...prev.data, [key]: e.target.value } })}
                    className="h-8 text-[12px]"
                  />
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <Button variant="outline" size="sm" onClick={() => setContactDialog(null)}>Cancel</Button>
                <Button size="sm" onClick={saveContact}>OK</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
