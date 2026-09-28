"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, MapPin, UserCheck, FileText, Check } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";

export interface CustomerRecord {
  _id: string;
  code: string;
  name: string;
  short_name?: string;
  details?: string;

  parent_customer_id?: string | null;
  customer_type: string;
  credit_limit: number | null;
  credit_term?: string;
  ntn_number?: string;
  sale_tax_number?: string;
  date_of_creation?: string;
  date_expiry?: string;
  iata_number?: string;

  gl_account: string;
  create_auto_ledger?: boolean;
  visible_to_all_branches?: boolean;
  hide_on_invoices?: boolean;

  spo_id?: string | null;
  spo_name: string;

  address_1?: string;
  address_2?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  city?: string;
  phone_1?: string;
  phone_2?: string;
  fax?: string;

  contact_person_name?: string;
  contact_person_designation?: string;
  contact_person_phone?: string;
  contact_person_email?: string;

  contact_info?: { phone?: string; email?: string };
  current_balance: number;
}

export const CUSTOMER_TYPES = ["Branches", "Corporate", "Industrial", "Travel Agent", "Walking"];

interface CustomerFormProps {
  /** Existing customers, used for the Parent Customer list and the default code. */
  customers: { _id: string; name: string; code?: string }[];
  /** Customer being edited; omit to create a new one. */
  editCustomer?: CustomerRecord | null;
  /** Prefill for the Title / Customer Name field when creating. */
  initialName?: string;
  onSaved: (customer: CustomerRecord) => void;
  onCancel: () => void;
}

/**
 * Full customer create/edit form (General / Address / Contact Person tabs).
 * Shared by the Customers module and the invoice "Create New Customer" pop-up.
 * Remount it (via `key`) to reset its state.
 */
export function CustomerForm({ customers, editCustomer, initialName = "", onSaved, onCancel }: CustomerFormProps) {
  const c = editCustomer;
  const editId = c?._id || null;

  const [activeTab, setActiveTab] = useState("general");

  // Code is assigned by the server on create and is read-only afterwards
  const code = c?.code || "";
  const [name, setName] = useState(c ? c.name || "" : initialName);
  const [shortName, setShortName] = useState(c?.short_name || "");
  const [details, setDetails] = useState(c?.details || "");

  const [parentCustomerId, setParentCustomerId] = useState(c?.parent_customer_id || "");
  const [customerType, setCustomerType] = useState(c?.customer_type || "Corporate");
  const [creditLimit, setCreditLimit] = useState(c?.credit_limit !== null && c?.credit_limit !== undefined ? String(c.credit_limit) : "");
  const [creditTerm, setCreditTerm] = useState(c?.credit_term || "");
  const [ntnNumber, setNtnNumber] = useState(c?.ntn_number || "");
  const [saleTaxNumber, setSaleTaxNumber] = useState(c?.sale_tax_number || "");
  const [dateOfCreation, setDateOfCreation] = useState(c ? c.date_of_creation || "" : new Date().toISOString().split("T")[0]);
  const [dateExpiry, setDateExpiry] = useState(c?.date_expiry || "");
  const [iataNumber, setIataNumber] = useState(c?.iata_number || "");

  const [glAccount, setGlAccount] = useState(c?.gl_account || "101001");
  const [createAutoLedger, setCreateAutoLedger] = useState(c?.create_auto_ledger !== undefined ? c.create_auto_ledger : true);
  const [visibleToAllBranches, setVisibleToAllBranches] = useState(c?.visible_to_all_branches !== undefined ? c.visible_to_all_branches : true);
  const [hideOnInvoices, setHideOnInvoices] = useState(c?.hide_on_invoices || false);

  const [spoName, setSpoName] = useState(c?.spo_name || "SPO 1");

  const [address1, setAddress1] = useState(c?.address_1 || "");
  const [address2, setAddress2] = useState(c?.address_2 || "");
  const [state, setState] = useState(c?.state || "");
  const [zipCode, setZipCode] = useState(c?.zip_code || "");
  const [country, setCountry] = useState(c?.country || "Pakistan");
  const [city, setCity] = useState(c?.city || "");
  const [phone1, setPhone1] = useState(c?.phone_1 || c?.contact_info?.phone || "");
  const [phone2, setPhone2] = useState(c?.phone_2 || "");
  const [fax, setFax] = useState(c?.fax || "");

  const [contactPersonName, setContactPersonName] = useState(c?.contact_person_name || "");
  const [contactPersonDesignation, setContactPersonDesignation] = useState(c?.contact_person_designation || "");
  const [contactPersonPhone, setContactPersonPhone] = useState(c?.contact_person_phone || "");
  const [contactPersonEmail, setContactPersonEmail] = useState(c?.contact_person_email || c?.contact_info?.email || "");

  const [saving, setSaving] = useState(false);

  async function handleSave() {
    // Check required fields (*): Title*, Customer Type*, GL Account*, SPO* (Code is auto-generated)
    const missing: string[] = [];
    if (!name.trim()) missing.push("Title / Customer Name (*)");
    if (!customerType.trim()) missing.push("Customer Type (*)");
    if (!glAccount.trim()) missing.push("GL Account (*)");
    if (!spoName.trim()) missing.push("SPO (*)");

    if (missing.length > 0) {
      alert(`Cannot save customer profile. Please fill in all required (*) fields:\n\n• ${missing.join("\n• ")}`);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        short_name: shortName.trim(),
        details: details.trim(),
        parent_customer_id: parentCustomerId && parentCustomerId !== "none" ? parentCustomerId : null,
        customer_type: customerType.trim(),
        credit_limit: creditLimit ? parseFloat(creditLimit) : null,
        credit_term: creditTerm.trim(),
        ntn_number: ntnNumber.trim(),
        sale_tax_number: saleTaxNumber.trim(),
        date_of_creation: dateOfCreation,
        date_expiry: dateExpiry,
        iata_number: iataNumber.trim(),
        gl_account: glAccount.trim(),
        create_auto_ledger: createAutoLedger,
        visible_to_all_branches: visibleToAllBranches,
        hide_on_invoices: hideOnInvoices,
        spo_name: spoName.trim(),
        address_1: address1.trim(),
        address_2: address2.trim(),
        state: state.trim(),
        zip_code: zipCode.trim(),
        country: country.trim(),
        city: city.trim(),
        phone_1: phone1.trim(),
        phone_2: phone2.trim(),
        fax: fax.trim(),
        contact_person_name: contactPersonName.trim(),
        contact_person_designation: contactPersonDesignation.trim(),
        contact_person_phone: contactPersonPhone.trim(),
        contact_person_email: contactPersonEmail.trim(),
        contact_info: { phone: phone1.trim() || contactPersonPhone.trim(), email: contactPersonEmail.trim() },
      };

      const url = editId ? `/api/customers/${editId}` : "/api/customers";
      const method = editId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const d = await res.json().catch(() => ({}));
        onSaved((d.customer || { ...payload, _id: editId || "" }) as CustomerRecord);
      } else {
        const d = await res.json();
        alert(d.error || "Failed to save customer");
      }
    } catch (err) {
      console.error(err);
      alert("An unexpected error occurred while saving customer.");
    } finally {
      setSaving(false);
    }
  }

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

        {/* Tab 1: General Information */}
        <TabsContent value="general" className="space-y-6">
          {/* Header Grid: Code, Title, Short Name, Details */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#141416] space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-semibold flex items-center gap-1 text-slate-700 dark:text-slate-300">
                  Code
                </Label>
                <Input
                  value={code}
                  readOnly
                  tabIndex={-1}
                  placeholder="Auto-generated on save"
                  title="Customer code is generated automatically"
                  className="h-9 font-mono text-[13px] bg-slate-100 dark:bg-[#18181b] text-slate-500 cursor-not-allowed"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-[12px] font-semibold flex items-center gap-1 text-slate-700 dark:text-slate-300">
                  Title / Customer Name <span className="text-red-500 font-bold">*</span>
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full Customer Account Title"
                  className="h-9 text-[13px] bg-white dark:bg-[#111113]"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">Short Name</Label>
                <Input
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  placeholder="Short Abbreviation"
                  className="h-9 text-[13px] bg-white dark:bg-[#111113]"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">Details</Label>
                <Textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Additional details / customer notes..."
                  className="min-h-[38px] h-9 text-[13px] bg-white dark:bg-[#111113]"
                />
              </div>
            </div>
          </div>

          {/* 3-Column Split: Customer Information | Account Information | SPO */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sub-Box 1: Customer Information */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113] space-y-3.5 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-1.5">
                <FileText className="h-4 w-4" /> Customer Information
              </h3>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Parent Customer</Label>
                <Select value={parentCustomerId} onValueChange={(val) => setParentCustomerId(val || "")}>
                  <SelectTrigger className="h-8 text-[12px] bg-white dark:bg-[#151518]">
                    <SelectValue placeholder="Search or select parent customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Independent Account)</SelectItem>
                    {customers.filter((pc) => pc._id !== editId).map((pc) => (
                      <SelectItem key={pc._id} value={pc._id}>{pc.name} ({pc.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold flex items-center gap-1 text-slate-600 dark:text-slate-400">
                  Customer Type <span className="text-red-500 font-bold">*</span>
                </Label>
                <Select value={customerType} onValueChange={(val) => setCustomerType(val || "Corporate")}>
                  <SelectTrigger className="h-8 text-[12px] bg-white dark:bg-[#151518]">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOMER_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Credit Limit</Label>
                  <Input
                    type="number"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    placeholder="0 (Unlimited)"
                    className="h-8 font-mono text-[12px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Credit Term</Label>
                  <Input
                    value={creditTerm}
                    onChange={(e) => setCreditTerm(e.target.value)}
                    placeholder="e.g. 30 Days"
                    className="h-8 text-[12px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">NTN Number</Label>
                  <Input
                    value={ntnNumber}
                    onChange={(e) => setNtnNumber(e.target.value)}
                    placeholder="1234567-9"
                    className="h-8 text-[12px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Sale Tax Number</Label>
                  <Input
                    value={saleTaxNumber}
                    onChange={(e) => setSaleTaxNumber(e.target.value)}
                    placeholder="09876543210"
                    className="h-8 text-[12px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Date of creation</Label>
                  <DatePicker
                    value={dateOfCreation}
                    onChange={(val) => setDateOfCreation(val)}
                    className="h-8 text-[12px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Date expiry</Label>
                  <DatePicker
                    value={dateExpiry}
                    onChange={(val) => setDateExpiry(val)}
                    className="h-8 text-[12px]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">IATA Number</Label>
                <Input
                  value={iataNumber}
                  onChange={(e) => setIataNumber(e.target.value)}
                  placeholder="Search / enter IATA code"
                  className="h-8 text-[12px]"
                />
              </div>
            </div>

            {/* Sub-Box 2: Account Information */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113] space-y-4 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-1.5">
                <Building2 className="h-4 w-4" /> Account Information
              </h3>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold flex items-center gap-1 text-slate-600 dark:text-slate-400">
                  GL Account <span className="text-red-500 font-bold">*</span>
                </Label>
                <Input
                  value={glAccount}
                  onChange={(e) => setGlAccount(e.target.value)}
                  placeholder="101001 - Trade Debtors"
                  className="h-8 font-mono text-[12px]"
                />
              </div>

              <div className="pt-2 space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer text-[12px] font-medium text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={createAutoLedger}
                    onChange={(e) => setCreateAutoLedger(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span>Create Auto Ledger Account</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-[12px] font-medium text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={visibleToAllBranches}
                    onChange={(e) => setVisibleToAllBranches(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span>Visible To All Branches</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-[12px] font-medium text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={hideOnInvoices}
                    onChange={(e) => setHideOnInvoices(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span>Hide on Invoices</span>
                </label>
              </div>
            </div>

            {/* Sub-Box 3: SPO Section */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113] space-y-4 shadow-sm h-fit">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-1.5">
                <UserCheck className="h-4 w-4" /> SPO Assignment
              </h3>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold flex items-center gap-1 text-slate-600 dark:text-slate-400">
                  SPO <span className="text-red-500 font-bold">*</span>
                </Label>
                <Input
                  value={spoName}
                  onChange={(e) => setSpoName(e.target.value)}
                  placeholder="SPO 1 / Agent Name"
                  className="h-8 text-[12px]"
                />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Address Information */}
        <TabsContent value="address" className="space-y-4">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#141416] space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">Address 1</Label>
                <Input
                  value={address1}
                  onChange={(e) => setAddress1(e.target.value)}
                  placeholder="Street address 1 (e.g. ISLAMABAD)"
                  className="h-9 text-[13px] bg-white dark:bg-[#111113]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">Address 2</Label>
                <Input
                  value={address2}
                  onChange={(e) => setAddress2(e.target.value)}
                  placeholder="Street address 2"
                  className="h-9 text-[13px] bg-white dark:bg-[#111113]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">City</Label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  className="h-9 text-[13px] bg-white dark:bg-[#111113]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">State</Label>
                <Input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="State / Province"
                  className="h-9 text-[13px] bg-white dark:bg-[#111113]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">Zip / Postal Code</Label>
                <Input
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  placeholder="Postal code"
                  className="h-9 text-[13px] bg-white dark:bg-[#111113]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">Country</Label>
                <Input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Pakistan"
                  className="h-9 text-[13px] bg-white dark:bg-[#111113]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">Phone 1</Label>
                <Input
                  value={phone1}
                  onChange={(e) => setPhone1(e.target.value)}
                  placeholder="Main telephone number"
                  className="h-9 text-[13px] bg-white dark:bg-[#111113]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">Phone 2</Label>
                <Input
                  value={phone2}
                  onChange={(e) => setPhone2(e.target.value)}
                  placeholder="Secondary phone"
                  className="h-9 text-[13px] bg-white dark:bg-[#111113]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">Fax</Label>
                <Input
                  value={fax}
                  onChange={(e) => setFax(e.target.value)}
                  placeholder="Fax number"
                  className="h-9 text-[13px] bg-white dark:bg-[#111113]"
                />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Contact Person Information */}
        <TabsContent value="contact" className="space-y-4">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#141416] space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">Contact Person Name</Label>
                <Input
                  value={contactPersonName}
                  onChange={(e) => setContactPersonName(e.target.value)}
                  placeholder="Full contact person name"
                  className="h-9 text-[13px] bg-white dark:bg-[#111113]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">Designation / Title</Label>
                <Input
                  value={contactPersonDesignation}
                  onChange={(e) => setContactPersonDesignation(e.target.value)}
                  placeholder="e.g. Accounts Manager"
                  className="h-9 text-[13px] bg-white dark:bg-[#111113]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">Phone / Mobile</Label>
                <Input
                  value={contactPersonPhone}
                  onChange={(e) => setContactPersonPhone(e.target.value)}
                  placeholder="Mobile or direct line"
                  className="h-9 text-[13px] bg-white dark:bg-[#111113]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">Email Address</Label>
                <Input
                  type="email"
                  value={contactPersonEmail}
                  onChange={(e) => setContactPersonEmail(e.target.value)}
                  placeholder="contact@customer.com"
                  className="h-9 text-[13px] bg-white dark:bg-[#111113]"
                />
              </div>
            </div>
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
            {saving ? "Saving..." : editId ? "Update Customer" : "Save Customer"}
          </Button>
        </div>
      </div>
    </>
  );
}
