"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Plus, BookOpen, ArrowUpRight, ArrowDownRight, X, ArrowLeft, UserPlus, Search,
  Pencil, Trash2, Building2, MapPin, UserCheck, FileText, Check, ShieldAlert
} from "lucide-react";

interface Customer {
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

const CUSTOMER_TYPES = ["Branches", "Corporate", "Industrial", "Travel Agent", "Walking"];

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Modal / Form state
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("general");

  // Form Fields
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [details, setDetails] = useState("");

  const [parentCustomerId, setParentCustomerId] = useState("");
  const [customerType, setCustomerType] = useState("Corporate");
  const [creditLimit, setCreditLimit] = useState("");
  const [creditTerm, setCreditTerm] = useState("");
  const [ntnNumber, setNtnNumber] = useState("");
  const [saleTaxNumber, setSaleTaxNumber] = useState("");
  const [dateOfCreation, setDateOfCreation] = useState(new Date().toISOString().split("T")[0]);
  const [dateExpiry, setDateExpiry] = useState("");
  const [iataNumber, setIataNumber] = useState("");

  const [glAccount, setGlAccount] = useState("101001");
  const [createAutoLedger, setCreateAutoLedger] = useState(true);
  const [visibleToAllBranches, setVisibleToAllBranches] = useState(true);
  const [hideOnInvoices, setHideOnInvoices] = useState(false);

  const [spoName, setSpoName] = useState("SPO 1");

  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [country, setCountry] = useState("Pakistan");
  const [city, setCity] = useState("");
  const [phone1, setPhone1] = useState("");
  const [phone2, setPhone2] = useState("");
  const [fax, setFax] = useState("");

  const [contactPersonName, setContactPersonName] = useState("");
  const [contactPersonDesignation, setContactPersonDesignation] = useState("");
  const [contactPersonPhone, setContactPersonPhone] = useState("");
  const [contactPersonEmail, setContactPersonEmail] = useState("");

  const [saving, setSaving] = useState(false);

  // Ledger State
  const [ledgerCustomer, setLedgerCustomer] = useState<string | null>(null);
  const [ledgerCustomerSearch, setLedgerCustomerSearch] = useState("");
  const [ledgerData, setLedgerData] = useState<Record<string, unknown> | null>(null);
  const [ledgerInvNo, setLedgerInvNo] = useState("");
  const [ledgerFromDate, setLedgerFromDate] = useState("");
  const [ledgerToDate, setLedgerToDate] = useState("");
  const [loadingLedgerFilter, setLoadingLedgerFilter] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/customers");
      const data = await res.json();
      setCustomers(data.customers || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setEditId(null);
    setActiveTab("general");
    setCode(`CUST-${String(customers.length + 1).padStart(6, "0")}`);
    setName("");
    setShortName("");
    setDetails("");
    setParentCustomerId("");
    setCustomerType("Corporate");
    setCreditLimit("");
    setCreditTerm("");
    setNtnNumber("");
    setSaleTaxNumber("");
    setDateOfCreation(new Date().toISOString().split("T")[0]);
    setDateExpiry("");
    setIataNumber("");
    setGlAccount("101001");
    setCreateAutoLedger(true);
    setVisibleToAllBranches(true);
    setHideOnInvoices(false);
    setSpoName("SPO 1");
    setAddress1("");
    setAddress2("");
    setState("");
    setZipCode("");
    setCountry("Pakistan");
    setCity("");
    setPhone1("");
    setPhone2("");
    setFax("");
    setContactPersonName("");
    setContactPersonDesignation("");
    setContactPersonPhone("");
    setContactPersonEmail("");
  };

  const openNewModal = () => {
    resetForm();
    setShowModal(true);
    setLedgerCustomer(null);
  };

  const openEditModal = (c: Customer) => {
    setEditId(c._id);
    setActiveTab("general");
    setCode(c.code || "");
    setName(c.name || "");
    setShortName(c.short_name || "");
    setDetails(c.details || "");
    setParentCustomerId(c.parent_customer_id || "");
    setCustomerType(c.customer_type || "Corporate");
    setCreditLimit(c.credit_limit !== null && c.credit_limit !== undefined ? String(c.credit_limit) : "");
    setCreditTerm(c.credit_term || "");
    setNtnNumber(c.ntn_number || "");
    setSaleTaxNumber(c.sale_tax_number || "");
    setDateOfCreation(c.date_of_creation || "");
    setDateExpiry(c.date_expiry || "");
    setIataNumber(c.iata_number || "");
    setGlAccount(c.gl_account || "101001");
    setCreateAutoLedger(c.create_auto_ledger !== undefined ? c.create_auto_ledger : true);
    setVisibleToAllBranches(c.visible_to_all_branches !== undefined ? c.visible_to_all_branches : true);
    setHideOnInvoices(c.hide_on_invoices || false);
    setSpoName(c.spo_name || "SPO 1");
    setAddress1(c.address_1 || "");
    setAddress2(c.address_2 || "");
    setState(c.state || "");
    setZipCode(c.zip_code || "");
    setCountry(c.country || "Pakistan");
    setCity(c.city || "");
    setPhone1(c.phone_1 || c.contact_info?.phone || "");
    setPhone2(c.phone_2 || "");
    setFax(c.fax || "");
    setContactPersonName(c.contact_person_name || "");
    setContactPersonDesignation(c.contact_person_designation || "");
    setContactPersonPhone(c.contact_person_phone || "");
    setContactPersonEmail(c.contact_person_email || c.contact_info?.email || "");

    setShowModal(true);
    setLedgerCustomer(null);
  };

  async function handleSave() {
    // Check required fields (*): Code*, Title*, Customer Type*, GL Account*, SPO*
    const missing: string[] = [];
    if (!code.trim()) missing.push("Code (*)");
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
        code: code.trim(),
        name: name.trim(),
        short_name: shortName.trim(),
        details: details.trim(),
        parent_customer_id: parentCustomerId || null,
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
        setShowModal(false);
        resetForm();
        load();
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

  async function handleDelete(id: string, custName: string) {
    if (!confirm(`Are you sure you want to delete customer "${custName}"?`)) return;
    try {
      const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
      if (res.ok) {
        load();
      } else {
        const d = await res.json();
        alert(d.error || "Failed to delete customer");
      }
    } catch (err) {
      console.error(err);
      alert("Error deleting customer");
    }
  }

  async function viewLedger(id: string, invNo = ledgerInvNo, from = ledgerFromDate, to = ledgerToDate, custSearch = ledgerCustomerSearch) {
    setShowModal(false);
    let targetId = id;
    if (custSearch.trim()) {
      const q = custSearch.trim().toLowerCase();
      const found = customers.find((c) => c.name.toLowerCase().includes(q) || (c.code && c.code.toLowerCase().includes(q)));
      if (found) {
        targetId = found._id;
      }
    } else {
      const currentCust = customers.find((c) => c._id === id);
      if (currentCust) setLedgerCustomerSearch(currentCust.name);
    }

    setLedgerCustomer(targetId);
    setLoadingLedgerFilter(true);
    const params = new URLSearchParams();
    if (invNo.trim()) params.set("invoice_number", invNo.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    try {
      const res = await fetch(`/api/customers/${targetId}/ledger?${params.toString()}`);
      setLedgerData(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLedgerFilter(false);
    }
  }

  const filteredCustomers = customers.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.code && c.code.toLowerCase().includes(q)) ||
      (c.ntn_number && c.ntn_number.toLowerCase().includes(q)) ||
      (c.spo_name && c.spo_name.toLowerCase().includes(q)) ||
      (c.customer_type && c.customer_type.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">Customers</h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">Manage customer profiles, credit limits, and ledger accounts</p>
        </div>
        {!showModal && !ledgerCustomer && (
          <Button
            onClick={openNewModal}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" /> New Customer
          </Button>
        )}
      </div>

      {/* Expanded Customer Creation / Edit Form Card */}
      {showModal && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113] shadow-lg">
          <CardHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between bg-slate-50/50 dark:bg-[#151518]">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <UserPlus className="h-5 w-5 text-primary" />
              {editId ? `Edit Customer — ${name}` : "Create New Customer Account"}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowModal(false)} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-6">
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
                        Code <span className="text-red-500 font-bold">*</span>
                      </Label>
                      <Input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="0123"
                        className="h-9 font-mono text-[13px] bg-white dark:bg-[#111113]"
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
                          {customers.filter((c) => c._id !== editId).map((c) => (
                            <SelectItem key={c._id} value={c._id}>{c.name} ({c.code})</SelectItem>
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
                        <Input
                          type="date"
                          value={dateOfCreation}
                          onChange={(e) => setDateOfCreation(e.target.value)}
                          className="h-8 text-[12px]"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Date expiry</Label>
                        <Input
                          type="date"
                          value={dateExpiry}
                          onChange={(e) => setDateExpiry(e.target.value)}
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
                <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving} className="gap-2 bg-primary hover:bg-primary/90">
                  <Check className="h-4 w-4" />
                  {saving ? "Saving..." : editId ? "Update Customer" : "Save Customer"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inline Customer Ledger Card */}
      {ledgerCustomer && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113] shadow-md">
          <CardHeader className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLedgerCustomer(null)}
                className="h-8 gap-1.5 text-xs font-semibold cursor-pointer border-slate-300 dark:border-slate-700"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Customers
              </Button>
              <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
                <BookOpen className="h-5 w-5 text-primary" /> Customer Ledger
              </CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setLedgerCustomer(null)} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-5">
            {ledgerData ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between gap-4 p-4 bg-gray-50 dark:bg-[#0e0e10] rounded-xl border border-gray-100 dark:border-[#1e1e21]">
                  <div>
                    <p className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">{(ledgerData.customer as Record<string, unknown>)?.name as string}</p>
                    <p className="text-[12px] text-gray-400 mt-1">Credit Limit: {((ledgerData.customer as Record<string, unknown>)?.credit_limit as number)?.toLocaleString() ?? "No limit"}</p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Current Balance</p>
                    <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-50 mt-1">{(ledgerData.current_balance as number)?.toLocaleString()}</p>
                  </div>
                </div>

                {/* Filter Controls for Customer Ledger */}
                <div className="flex flex-col sm:flex-row flex-wrap items-end gap-3 p-3 rounded-lg bg-slate-50 dark:bg-[#151518] border border-slate-200 dark:border-slate-800">
                  <div className="space-y-1 flex-1 min-w-[180px]">
                    <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Search Customer Name / ID</Label>
                    <Input
                      placeholder="e.g. Customer Name or Code"
                      value={ledgerCustomerSearch}
                      onChange={(e) => setLedgerCustomerSearch(e.target.value)}
                      className="h-8 text-xs bg-white dark:bg-[#111113]"
                    />
                  </div>
                  <div className="space-y-1 flex-1 min-w-[140px]">
                    <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Invoice Number</Label>
                    <Input
                      placeholder="e.g. 158"
                      value={ledgerInvNo}
                      onChange={(e) => setLedgerInvNo(e.target.value)}
                      className="h-8 text-xs bg-white dark:bg-[#111113]"
                    />
                  </div>
                  <div className="space-y-1 w-full sm:w-36">
                    <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">From Date</Label>
                    <Input
                      type="date"
                      value={ledgerFromDate}
                      onChange={(e) => setLedgerFromDate(e.target.value)}
                      className="h-8 text-xs bg-white dark:bg-[#111113]"
                    />
                  </div>
                  <div className="space-y-1 w-full sm:w-36">
                    <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">To Date</Label>
                    <Input
                      type="date"
                      value={ledgerToDate}
                      onChange={(e) => setLedgerToDate(e.target.value)}
                      className="h-8 text-xs bg-white dark:bg-[#111113]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => ledgerCustomer && viewLedger(ledgerCustomer)}
                      disabled={loadingLedgerFilter}
                      className="h-8 text-xs gap-1 cursor-pointer"
                    >
                      <Search className="h-3.5 w-3.5" /> Filter
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setLedgerInvNo("");
                        setLedgerFromDate("");
                        setLedgerToDate("");
                        if (ledgerCustomer) viewLedger(ledgerCustomer, "", "", "");
                      }}
                      className="h-8 text-xs bg-white dark:bg-[#111113] cursor-pointer"
                    >
                      Reset
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-100 dark:border-[#1e1e21]">
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Type</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Reference</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Debit</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {((ledgerData.entries as Array<Record<string, unknown>>) || []).map((e, i) => (
                        <TableRow key={i} className="border-gray-100 dark:border-[#1e1e21]">
                          <TableCell className="text-[13px] text-gray-500">{new Date(e.date as string).toLocaleDateString()}</TableCell>
                          <TableCell className="text-[13px] capitalize text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                            {(e.debit as number) > 0 ? <ArrowUpRight className="h-3 w-3 text-red-500" /> : <ArrowDownRight className="h-3 w-3 text-emerald-500" />}
                            {(e.type as string).replace("_", " ")}
                          </TableCell>
                          <TableCell className="font-mono text-[13px] text-gray-500">{e.reference as string}</TableCell>
                          <TableCell className="text-right font-mono text-[13px] text-red-600 dark:text-red-400">{(e.debit as number) > 0 ? (e.debit as number).toLocaleString() : ""}</TableCell>
                          <TableCell className="text-right font-mono text-[13px] text-emerald-600 dark:text-emerald-400">{(e.credit as number) > 0 ? (e.credit as number).toLocaleString() : ""}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Customers Register Table Card */}
      <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
        <CardHeader className="px-6 pt-5 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-50 flex items-center gap-2">
            <span>Customer Register</span>
            <Badge variant="secondary" className="text-[11px] font-mono font-normal">
              {filteredCustomers.length} {filteredCustomers.length === 1 ? "customer" : "customers"}
            </Badge>
          </CardTitle>
          <div className="w-full sm:w-64">
            <Input
              placeholder="Search code, title, NTN, SPO..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-[12px]"
            />
          </div>
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
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Code *</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Title / Name *</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Type *</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">GL Account *</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">SPO *</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Contact</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Credit Limit</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Balance</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-[13px] text-gray-400">
                        No customers found matching your search.
                      </TableCell>
                    </TableRow>
                  ) : filteredCustomers.map((c) => (
                    <TableRow key={c._id} className="border-gray-100 dark:border-[#1e1e21] hover:bg-gray-50/50 dark:hover:bg-[#151517]">
                      <TableCell className="text-[12px] font-mono font-bold text-primary">{c.code || "-"}</TableCell>
                      <TableCell className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                        <div>{c.name}</div>
                        {c.short_name && <span className="text-[11px] text-slate-400 font-normal">{c.short_name}</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-semibold">
                          {c.customer_type || "Corporate"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[12px] font-mono text-gray-600 dark:text-gray-300">{c.gl_account || "101001"}</TableCell>
                      <TableCell className="text-[12px] text-gray-600 dark:text-gray-300">{c.spo_name || "SPO 1"}</TableCell>
                      <TableCell className="text-[12px] text-gray-500">
                        <div>{c.phone_1 || c.contact_info?.phone || "-"}</div>
                        {(c.contact_person_email || c.contact_info?.email) && (
                          <div className="text-[11px] text-slate-400">{c.contact_person_email || c.contact_info?.email}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[13px] text-gray-600 dark:text-gray-300">
                        {c.credit_limit?.toLocaleString() ?? <span className="text-gray-400">No limit</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                        {c.current_balance.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 cursor-pointer" onClick={() => openEditModal(c)}>
                            <Pencil className="h-3 w-3 text-blue-500" /> Edit
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 cursor-pointer" onClick={() => viewLedger(c._id)}>
                            <BookOpen className="h-3 w-3 text-emerald-500" /> Ledger
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(c._id, c.name)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
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
