"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, MapPin, UserCheck, FileText, Check, Landmark, Store, Briefcase, Footprints } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { apiFetch, notify } from "@/lib/notify";

export interface CustomerRecord {
  _id: string;
  code: string;
  name: string;
  short_name?: string;
  details?: string;
  business_email?: string;

  parent_customer_id?: string | null;
  customer_type: string;
  credit_limit: number | null;
  credit_term?: string;
  ntn_number?: string;
  sale_tax_number?: string;
  date_of_creation?: string;
  date_expiry?: string;
  iata_number?: string;
  branch_location?: string;

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

/** Stored customer_type values, in the order the type picker shows them. */
export const CUSTOMER_TYPES = ["Branches", "Corporate", "Travel Agent", "Walking"];

const TYPE_OPTIONS: { value: string; label: string; hint: string; icon: ComponentType<{ className?: string }> }[] = [
  { value: "Branches", label: "Branch", hint: "Invoice your own branch", icon: Store },
  { value: "Corporate", label: "Corporate", hint: "Company account", icon: Building2 },
  { value: "Travel Agent", label: "Travel Agent", hint: "B2B agent account", icon: Briefcase },
  { value: "Walking", label: "Walk-in", hint: "Individual, one-off", icon: Footprints },
];

const TYPE_NAMES: Record<string, string> = {
  Branches: "Branch",
  Corporate: "Corporate",
  "Travel Agent": "Travel Agent",
  Walking: "Walk-in Customer",
  Industrial: "Industrial",
};

/** Display name for a stored customer_type value. */
export function customerTypeLabel(type?: string) {
  return TYPE_NAMES[type || ""] || type || "Corporate";
}

// Older records may carry types that are no longer offered; edit them as Corporate.
const toPickerType = (type?: string) => (type && CUSTOMER_TYPES.includes(type) ? type : type ? "Corporate" : "");

const inputClass = "h-9 text-[13px] bg-white dark:bg-[#111113]";

function Field({ label, required, full, children }: { label: string; required?: boolean; full?: boolean; children: ReactNode }) {
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <Label className="text-[12px] font-semibold flex items-center gap-1 text-slate-700 dark:text-slate-300">
        {label} {required && <span className="text-red-500 font-bold">*</span>}
      </Label>
      {children}
    </div>
  );
}

function Group({ title, icon: Icon, color, children }: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  children: ReactNode;
}) {
  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#141416] space-y-4">
      <h3 className={`text-xs font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-1.5 ${color}`}>
        <Icon className="h-4 w-4" /> {title}
      </h3>
      {children}
    </div>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer text-[12px] font-medium text-slate-700 dark:text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
      />
      <span>{label}</span>
    </label>
  );
}

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
 * Customer create/edit form. Step 1 picks the customer type (Branch, Corporate, Travel Agent,
 * Walk-in); the General Information and Address & Contact tabs then show only the fields that
 * apply to that type. Shared by the Customers module and the invoice "Create New Customer" pop-up.
 * Remount it (via `key`) to reset its state.
 */
export function CustomerForm({ customers, editCustomer, initialName = "", onSaved, onCancel }: CustomerFormProps) {
  const c = editCustomer;
  const editId = c?._id || null;

  const [activeTab, setActiveTab] = useState("general");
  const [customerType, setCustomerType] = useState(toPickerType(c?.customer_type));

  // Code is assigned by the server on create and is read-only afterwards
  const code = c?.code || "";
  const [name, setName] = useState(c ? c.name || "" : initialName);
  const [shortName, setShortName] = useState(c?.short_name || "");
  const [businessEmail, setBusinessEmail] = useState(c?.business_email || c?.contact_info?.email || "");
  const [details, setDetails] = useState(c?.details || "");

  const [parentCustomerId, setParentCustomerId] = useState(c?.parent_customer_id || "");
  const [creditLimit, setCreditLimit] = useState(c?.credit_limit !== null && c?.credit_limit !== undefined ? String(c.credit_limit) : "");
  const [creditTerm, setCreditTerm] = useState(c?.credit_term || "");
  const [ntnNumber, setNtnNumber] = useState(c?.ntn_number || "");
  const [saleTaxNumber, setSaleTaxNumber] = useState(c?.sale_tax_number || "");
  const [dateOfCreation, setDateOfCreation] = useState(c ? c.date_of_creation || "" : new Date().toISOString().split("T")[0]);
  const [dateExpiry, setDateExpiry] = useState(c?.date_expiry || "");
  const [iataNumber, setIataNumber] = useState(c?.iata_number || "");
  const [branchLocation, setBranchLocation] = useState(c?.branch_location || "");

  const [glAccount, setGlAccount] = useState(c?.gl_account || "101001");
  const [createAutoLedger, setCreateAutoLedger] = useState(c?.create_auto_ledger !== undefined ? c.create_auto_ledger : true);
  const [visibleToAllBranches, setVisibleToAllBranches] = useState(c?.visible_to_all_branches !== undefined ? c.visible_to_all_branches : true);
  const [hideOnInvoices, setHideOnInvoices] = useState(c?.hide_on_invoices || false);

  const [spoName, setSpoName] = useState(c ? c.spo_name || "" : "SPO 1");

  const [address1, setAddress1] = useState(c?.address_1 || "");
  const [address2, setAddress2] = useState(c?.address_2 || "");
  const [state, setState] = useState(c?.state || "");
  const [zipCode, setZipCode] = useState(c?.zip_code || "");
  const [country, setCountry] = useState(c?.country || "Pakistan");
  const [city, setCity] = useState(c?.city || "");
  const [mobile1, setMobile1] = useState(c?.phone_1 || c?.contact_info?.phone || "");
  const [mobile2, setMobile2] = useState(c?.phone_2 || "");

  const [contactPersonName, setContactPersonName] = useState(c?.contact_person_name || "");
  const [contactPersonDesignation, setContactPersonDesignation] = useState(c?.contact_person_designation || "");
  const [contactPersonPhone, setContactPersonPhone] = useState(c?.contact_person_phone || "");
  const [contactPersonEmail, setContactPersonEmail] = useState(c?.contact_person_email || "");

  const [saving, setSaving] = useState(false);

  const isBranch = customerType === "Branches";
  const isTravelAgent = customerType === "Travel Agent";
  // Corporate and Travel Agent accounts carry credit, tax, IATA, SPO and contact-person details
  const isAccount = customerType === "Corporate" || isTravelAgent;

  async function handleSave() {
    const missing: string[] = [];
    if (!customerType) missing.push("Customer Type (*)");
    if (!name.trim()) missing.push("Title / Customer Name (*)");
    if (!glAccount.trim()) missing.push("GL Account (*)");
    if (isBranch && !branchLocation.trim()) missing.push("Branch Location / City (*)");
    if (isTravelAgent && !iataNumber.trim()) missing.push("IATA Number (*)");
    if (isAccount && !spoName.trim()) missing.push("SPO (*)");

    if (missing.length > 0) {
      notify.error("Please fill in all required (*) fields", missing);
      return;
    }

    setSaving(true);
    try {
      // Fields that don't apply to the chosen type are cleared, so switching type
      // doesn't leave hidden values behind.
      const payload = {
        name: name.trim(),
        short_name: shortName.trim(),
        business_email: businessEmail.trim(),
        details: details.trim(),
        customer_type: customerType,
        parent_customer_id: isAccount && parentCustomerId && parentCustomerId !== "none" ? parentCustomerId : null,
        credit_limit: isAccount && creditLimit ? parseFloat(creditLimit) : null,
        credit_term: isAccount ? creditTerm.trim() : "",
        ntn_number: isAccount ? ntnNumber.trim() : "",
        sale_tax_number: isAccount ? saleTaxNumber.trim() : "",
        date_of_creation: dateOfCreation,
        date_expiry: isAccount ? dateExpiry : "",
        iata_number: isAccount ? iataNumber.trim() : "",
        branch_location: isBranch ? branchLocation.trim() : "",
        gl_account: glAccount.trim(),
        create_auto_ledger: createAutoLedger,
        visible_to_all_branches: visibleToAllBranches,
        hide_on_invoices: hideOnInvoices,
        spo_name: isAccount ? spoName.trim() : "",
        address_1: address1.trim(),
        address_2: address2.trim(),
        state: state.trim(),
        zip_code: zipCode.trim(),
        country: country.trim(),
        city: city.trim(),
        phone_1: mobile1.trim(),
        phone_2: mobile2.trim(),
        contact_person_name: isAccount ? contactPersonName.trim() : "",
        contact_person_designation: isAccount ? contactPersonDesignation.trim() : "",
        contact_person_phone: isAccount ? contactPersonPhone.trim() : "",
        contact_person_email: isAccount ? contactPersonEmail.trim() : "",
      };

      const url = editId ? `/api/customers/${editId}` : "/api/customers";
      const method = editId ? "PATCH" : "POST";

      const d = await apiFetch<{ customer?: CustomerRecord }>(url, { method, body: payload });
      notify.success(editId ? `Customer "${payload.name}" updated` : `Customer "${payload.name}" created`);
      onSaved((d.customer || { ...payload, _id: editId || "" }) as CustomerRecord);
    } catch (err) {
      notify.error("Failed to save customer", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Step 1 — customer type */}
      <div className="space-y-2.5">
        <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">Step 1 — Select customer type</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TYPE_OPTIONS.map((t) => {
            const active = customerType === t.value;
            const Icon = t.icon;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setCustomerType(t.value)}
                aria-pressed={active}
                className={`rounded-xl border px-3 py-4 text-center transition-colors cursor-pointer ${
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#141416] text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                <Icon className="h-5 w-5 mx-auto mb-1.5" />
                <span className="block text-[13px] font-semibold">{t.label}</span>
                <span className={`block text-[11px] mt-0.5 ${active ? "text-primary-foreground/70" : "text-slate-400"}`}>{t.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {!customerType ? (
        <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-800 mt-6">
          <span className="text-[11px] text-slate-400">Choose a customer type to continue.</span>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      ) : (
        <>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-6">
            <TabsList className="grid grid-cols-2 w-full max-w-sm mb-6 bg-slate-100 dark:bg-[#18181b] p-1 rounded-xl">
              <TabsTrigger value="general" className="text-xs font-semibold gap-1.5 py-2">
                <Building2 className="h-3.5 w-3.5 text-primary" /> General Information
              </TabsTrigger>
              <TabsTrigger value="address" className="text-xs font-semibold gap-1.5 py-2">
                <MapPin className="h-3.5 w-3.5 text-emerald-500" /> Address &amp; Contact
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: General Information */}
            <TabsContent value="general" className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Code">
                  <Input
                    value={code}
                    readOnly
                    tabIndex={-1}
                    placeholder="Auto-generated on save"
                    title="Customer code is generated automatically"
                    className="h-9 font-mono text-[13px] bg-slate-100 dark:bg-[#18181b] text-slate-500 cursor-not-allowed"
                  />
                </Field>
                <Field label="Short Name">
                  <Input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="Short abbreviation" className={inputClass} />
                </Field>
                <Field label="Title / Customer Name" required full>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full customer account title" className={inputClass} />
                </Field>
                <Field label="Business Email">
                  <Input type="email" value={businessEmail} onChange={(e) => setBusinessEmail(e.target.value)} placeholder="accounts@customer.com" className={inputClass} />
                </Field>
                <Field label="Customer Type">
                  <Input
                    value={customerTypeLabel(customerType)}
                    readOnly
                    tabIndex={-1}
                    className="h-9 text-[13px] bg-slate-100 dark:bg-[#18181b] text-slate-500 cursor-not-allowed"
                  />
                </Field>
                <Field label="Details" full>
                  <Textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Additional details / customer notes..." className="min-h-[42px] text-[13px] bg-white dark:bg-[#111113]" />
                </Field>
              </div>

              {isAccount && (
                <Group title="Customer Information" icon={FileText} color="text-primary">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Parent Customer">
                      <Select value={parentCustomerId} onValueChange={(val) => setParentCustomerId(val || "")}>
                        <SelectTrigger className="h-9 w-full text-[13px] bg-white dark:bg-[#111113]">
                          <SelectValue placeholder="Search or select parent customer" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None (Independent Account)</SelectItem>
                          {customers.filter((pc) => pc._id !== editId).map((pc) => (
                            <SelectItem key={pc._id} value={pc._id}>{pc.name} ({pc.code})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Credit Limit">
                      <Input type="number" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="0 (Unlimited)" className={`${inputClass} font-mono`} />
                    </Field>
                    <Field label="Credit Term">
                      <Input value={creditTerm} onChange={(e) => setCreditTerm(e.target.value)} placeholder="e.g. 30 Days" className={inputClass} />
                    </Field>
                    <Field label="NTN Number">
                      <Input value={ntnNumber} onChange={(e) => setNtnNumber(e.target.value)} placeholder="1234567-9" className={inputClass} />
                    </Field>
                    <Field label="Sale Tax Number">
                      <Input value={saleTaxNumber} onChange={(e) => setSaleTaxNumber(e.target.value)} placeholder="09876543210" className={inputClass} />
                    </Field>
                    <Field label="Date of Creation">
                      <DatePicker value={dateOfCreation} onChange={(val) => setDateOfCreation(val)} className={inputClass} />
                    </Field>
                    <Field label="Date Expiry">
                      <DatePicker value={dateExpiry} onChange={(val) => setDateExpiry(val)} className={inputClass} />
                    </Field>
                    <Field label="IATA Number" required={isTravelAgent}>
                      <Input
                        value={iataNumber}
                        onChange={(e) => setIataNumber(e.target.value)}
                        placeholder={isTravelAgent ? "Search / enter IATA code" : "Search / enter IATA code (optional)"}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </Group>
              )}

              {isBranch && (
                <Group title="Branch Details" icon={Store} color="text-primary">
                  <Field label="Branch Location / City" required>
                    <Input value={branchLocation} onChange={(e) => setBranchLocation(e.target.value)} placeholder="e.g. Lahore Branch" className={inputClass} />
                  </Field>
                </Group>
              )}

              <Group title="Account Information" icon={Landmark} color="text-emerald-600">
                <Field label="GL Account" required>
                  <Input value={glAccount} onChange={(e) => setGlAccount(e.target.value)} placeholder="101001" className={`${inputClass} font-mono`} />
                </Field>
                <div className="space-y-3">
                  <Checkbox label="Create Auto Ledger Account" checked={createAutoLedger} onChange={setCreateAutoLedger} />
                  <Checkbox label="Visible To All Branches" checked={visibleToAllBranches} onChange={setVisibleToAllBranches} />
                  <Checkbox label="Hide on Invoices" checked={hideOnInvoices} onChange={setHideOnInvoices} />
                </div>
              </Group>

              {isAccount && (
                <Group title="SPO Assignment" icon={UserCheck} color="text-blue-600">
                  <Field label="SPO" required>
                    <Input value={spoName} onChange={(e) => setSpoName(e.target.value)} placeholder="SPO 1" className={inputClass} />
                  </Field>
                </Group>
              )}
            </TabsContent>

            {/* Tab 2: Address & Contact */}
            <TabsContent value="address" className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Address 1">
                  <Input value={address1} onChange={(e) => setAddress1(e.target.value)} placeholder="Street address 1 (e.g. ISLAMABAD)" className={inputClass} />
                </Field>
                <Field label="Address 2">
                  <Input value={address2} onChange={(e) => setAddress2(e.target.value)} placeholder="Street address 2" className={inputClass} />
                </Field>
                <Field label="City">
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className={inputClass} />
                </Field>
                <Field label="State">
                  <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="State / Province" className={inputClass} />
                </Field>
                <Field label="Zip / Postal Code">
                  <Input value={zipCode} onChange={(e) => setZipCode(e.target.value)} placeholder="Postal code" className={inputClass} />
                </Field>
                <Field label="Country">
                  <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Pakistan" className={inputClass} />
                </Field>
                <Field label="Mobile Number 1">
                  <Input value={mobile1} onChange={(e) => setMobile1(e.target.value)} placeholder="Main mobile number" className={inputClass} />
                </Field>
                <Field label="Mobile Number 2">
                  <Input value={mobile2} onChange={(e) => setMobile2(e.target.value)} placeholder="Secondary mobile number" className={inputClass} />
                </Field>
              </div>

              {isAccount && (
                <Group title="Contact Person" icon={UserCheck} color="text-blue-600">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Contact Person Name">
                      <Input value={contactPersonName} onChange={(e) => setContactPersonName(e.target.value)} placeholder="Full contact person name" className={inputClass} />
                    </Field>
                    <Field label="Designation / Title">
                      <Input value={contactPersonDesignation} onChange={(e) => setContactPersonDesignation(e.target.value)} placeholder="e.g. Accounts Manager" className={inputClass} />
                    </Field>
                    <Field label="Mobile / Phone">
                      <Input value={contactPersonPhone} onChange={(e) => setContactPersonPhone(e.target.value)} placeholder="Mobile or direct line" className={inputClass} />
                    </Field>
                    <Field label="Email Address">
                      <Input type="email" value={contactPersonEmail} onChange={(e) => setContactPersonEmail(e.target.value)} placeholder="contact@customer.com" className={inputClass} />
                    </Field>
                  </div>
                </Group>
              )}
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
      )}
    </>
  );
}
