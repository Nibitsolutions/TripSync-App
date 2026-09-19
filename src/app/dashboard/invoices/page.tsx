"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Send, Ban, CreditCard, Trash2, History, Loader2, Pencil,
  Printer, Plane, FileText, Calculator, Search, X, RotateCcw, AlertTriangle, Check, Layers,
  ArrowLeft, Copy, CheckCircle2, Save, ChevronLeft, ChevronRight
} from "lucide-react";
import { CITY_AIRPORT_CODES, formatTicketNumber, getAirlineByTicketNumber, incrementTicketNumber } from "@/lib/iataAirlines";
import { validateInvoiceForPosting } from "@/lib/invoiceValidation";

interface Invoice {
  _id: string;
  invoice_number: string;
  customer_id: { _id: string; name: string } | string;
  status: string;
  currency: string;
  total_amount: number;
  paid_amount?: number;
  due_amount?: number;
  payment_status?: "Paid" | "Partial" | "Unpaid";
  bsp_flag: boolean;
  payment_mode?: string;
  remarks?: string;
  internal_remarks?: string;
  customer_remarks?: string;
  print_name?: string;
  created_at: string;
}

interface Customer { _id: string; name: string; code?: string; }
interface Supplier { _id: string; name: string; code?: string; }
interface UserItem { _id: string; name: string; role: string; }

interface FlightSegment {
  city: string;
  flight_no: string;
  booking_class: string;
  dep_date: string;
  arr_date?: string;
  dep_time: string;
  arr_time: string;
}

interface DynamicTaxItem {
  code: string;
  amount: string;
}

interface LineItemInput {
  service_type: string;
  description: string;
  amount: string;
  commission_override_rate: string;
  tax_code_id: string;
  
  // Passenger & Airline Details
  pax_name?: string;
  pax_type?: string;
  passport_no?: string;
  passport_issue_date?: string;
  ticket_number?: string;
  conjunction_ticket_no?: string;
  conjunction_route?: string;
  conjunction_city?: string;
  conjunction_flight_no?: string;
  conjunction_booking_class?: string;
  conjunction_dep_date?: string;
  conjunction_arr_date?: string;
  conjunction_dep_time?: string;
  conjunction_arr_time?: string;
  gds_pnr?: string;
  gds_name?: string;
  airline_name?: string;
  airline_code?: string;
  sector?: string;
  trip_type?: string;
  doc_type?: string;
  tour_code?: string;
  issue_date?: string;
  our_xo?: string;
  customer_remarks?: string;
  flight_segments?: FlightSegment[];
  
  // Dynamic Taxes
  airline_city_taxes?: DynamicTaxItem[];
  city_taxes?: DynamicTaxItem[];

  // International Fixed Taxes (SP, RG, PK, YR, YQ, DOF, XZ, YD, YI, RN)
  base_fare?: string;
  tax_sp?: string;
  tax_rg?: string;
  tax_pk?: string;
  tax_yr?: string;
  tax_yq?: string;
  tax_dof?: string;
  tax_xz?: string;
  tax_yd?: string;
  tax_yi?: string;
  tax_rn?: string;
  tax_apt?: string;
  tax_kbr?: string;
  tax_kbp?: string;
  tax_pb?: string;
  tax_city?: string;
  tax_airline_city?: string;
  other_taxes?: string;

  // Domestic Taxes
  tax_ced?: string;
  tax_gst_dom?: string;
  tax_ast?: string;

  // Commercials & Deductions Matrix
  commission_percent?: string;
  commission_amount?: string;
  wht_percent?: string;
  wht_amount?: string;
  discount_percent?: string;
  discount_amount?: string;
  discount2_percent?: string;
  discount2_amount?: string;
  psf_p_percent?: string;
  psf_p_amount?: string;
  psf_percent?: string;
  psf_amount?: string;
  gst_percent?: string;
  gst_amount?: string;
  seg_percent?: string;
  seg_amount?: string;
  wht_c_percent?: string;
  wht_c_amount?: string;
  auto_update?: boolean;

  // Cancellation Charges
  cancellation_charges_self?: string;
  cancellation_charges_supplier?: string;

  // 2-Sided Accounting Totals
  supplier_id?: string;
  customer_gross?: number;
  customer_net?: number;
  supplier_gross?: number;
  supplier_net?: number;
  supplier_gross_wo_wht?: number;
  agency_margin?: number;
}

interface AuditLogEntry {
  _id: string;
  field_changed: string;
  old_value: string | number | boolean | null;
  new_value: string | number | boolean | null;
  changed_by: { name: string } | null;
  changed_at: string;
}

function InvoicesPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const typeFilter = searchParams.get("type");

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [staffUsers, setStaffUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  // Ticket sidebar collapse states
  const [isTicketSidebarCollapsed, setIsTicketSidebarCollapsed] = useState(false);
  const [isEditTicketSidebarCollapsed, setIsEditTicketSidebarCollapsed] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRangeFilter, setDateRangeFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");

  // Delete invoice state
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Double-submission protection states
  const [isCreating, setIsCreating] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Action dialogs state
  const [voidDialog, setVoidDialog] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [creditDialog, setCreditDialog] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");

  // Invoice Header State
  const [newCustomerId, setNewCustomerId] = useState("");
  const [newCurrency] = useState("PKR");
  const [newPaymentMode, setNewPaymentMode] = useState("CR");
  const [newRemarks, setNewRemarks] = useState("");
  const [newInternalRemarks, setNewInternalRemarks] = useState("");
  const [newCustomerRemarks, setNewCustomerRemarks] = useState("");
  const [newVisitType, setNewVisitType] = useState("Visitor");
  const [newSpoId, setNewSpoId] = useState("");
  const [newSupplierId, setNewSupplierId] = useState("");
  const [newPrintName, setNewPrintName] = useState("");
  const [newInvDate, setNewInvDate] = useState(new Date().toISOString().split("T")[0]);
  const [newAdjDate, setNewAdjDate] = useState(new Date().toISOString().split("T")[0]);
  const [newOurXo, setNewOurXo] = useState("E");
  const [newClientXo, setNewClientXo] = useState("");
  const [newDocStatus, setNewDocStatus] = useState("Draft");
  const [newBsp] = useState(false);
  const [newBspBillingPeriod] = useState("");
  const [activeTicketTab, setActiveTicketTab] = useState(0);
  const [activeEditTicketTab, setActiveEditTicketTab] = useState(0);

  interface ConfiguredTaxCode {
    _id: string;
    name: string;
    code: string;
    category: string;
    default_percentage: number | null;
    active: boolean;
  }

  const [configuredTaxCodes, setConfiguredTaxCodes] = useState<ConfiguredTaxCode[]>([]);

  const loadTaxCodes = useCallback(async () => {
    try {
      const res = await fetch("/api/tax-codes");
      const data = await res.json();
      if (data.tax_codes) {
        setConfiguredTaxCodes(data.tax_codes);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    loadTaxCodes();
  }, [loadTaxCodes]);

  const defaultType = (typeFilter && typeFilter !== "Other") ? typeFilter : "Ticket";

  const createDefaultTicketItem = (taxList?: ConfiguredTaxCode[]): LineItemInput => {
    const codes = Array.isArray(taxList) ? taxList : Array.isArray(configuredTaxCodes) ? configuredTaxCodes : [];
    const findDefaultPct = (searchKey: string) => {
      if (!codes || !codes.length) return "";
      const searchUpper = searchKey.toUpperCase();
      const found = codes.find((t) => {
        if (!t || !t.active) return false;
        const codeStr = t.code ? String(t.code).trim().toUpperCase() : "";
        const nameStr = t.name ? String(t.name).trim().toUpperCase() : "";
        return (codeStr && codeStr === searchUpper) || (nameStr && nameStr.includes(searchUpper));
      });
      return found && found.default_percentage !== null && found.default_percentage !== undefined
        ? String(found.default_percentage)
        : "";
    };

    const whtDefault = findDefaultPct("WHT") || "24";
    const psfDefault = findDefaultPct("PSF") || "0";
    const gstDefault = findDefaultPct("SST") || findDefaultPct("GST") || "0";

    return {
      service_type: "Ticket",
      description: "",
      amount: "0",
      commission_override_rate: "",
      tax_code_id: "",
      pax_name: "",
      pax_type: "A",
      passport_no: "",
      passport_issue_date: "",
      ticket_number: "",
      conjunction_ticket_no: "",
      conjunction_route: "",
      conjunction_city: "",
      conjunction_flight_no: "",
      conjunction_booking_class: "",
      conjunction_dep_date: "",
      conjunction_dep_time: "",
      conjunction_arr_time: "",
      gds_pnr: "",
      gds_name: "Amadeus",
      airline_name: "",
      airline_code: "",
      sector: "",
      trip_type: "International",
      doc_type: "BSPD",
      tour_code: "",
      our_xo: "E",
      customer_remarks: "",
      issue_date: new Date().toISOString().split("T")[0],
      flight_segments: [
        { city: "", flight_no: "", booking_class: "Y", dep_date: "", dep_time: "", arr_time: "" },
        { city: "", flight_no: "", booking_class: "Y", dep_date: "", dep_time: "", arr_time: "" },
      ],
      airline_city_taxes: [
        { code: "XT", amount: "0" },
      ],
      city_taxes: [
        { code: "City Tax", amount: "0" },
      ],
      base_fare: "0",
      tax_rn: "0",
      tax_sp: "0",
      tax_rg: "0",
      tax_pk: "0",
      tax_yr: "0",
      tax_yq: "0",
      tax_dof: "0",
      tax_xz: "0",
      tax_yd: "0",
      tax_yi: "0",
      tax_apt: "0",
      tax_kbr: "0",
      tax_kbp: "0",
      tax_pb: "0",
      tax_city: "0",
      tax_airline_city: "0",
      other_taxes: "0",
      tax_ced: "0",
      tax_gst_dom: "0",
      tax_ast: "0",
      commission_percent: "0",
      commission_amount: "0",
      wht_percent: whtDefault,
      wht_amount: "0",
      discount_percent: "0",
      discount_amount: "0",
      discount2_percent: "0",
      discount2_amount: "0",
      psf_p_percent: "0",
      psf_p_amount: "0",
      psf_percent: psfDefault,
      psf_amount: "0",
      gst_percent: gstDefault,
      gst_amount: "0",
      seg_percent: "0",
      seg_amount: "0",
      wht_c_percent: "0",
      wht_c_amount: "0",
      auto_update: true,
      cancellation_charges_self: "0",
      cancellation_charges_supplier: "0",
      customer_gross: 0,
      customer_net: 0,
      supplier_gross: 0,
      supplier_net: 0,
      supplier_gross_wo_wht: 0,
      agency_margin: 0,
    };
  };

  const [lineItems, setLineItems] = useState<LineItemInput[]>([
    defaultType === "Ticket"
      ? createDefaultTicketItem()
      : { service_type: defaultType, description: "", amount: "", commission_override_rate: "", tax_code_id: "" },
  ]);

  // Audit Logs state
  const [auditDialogInvoice, setAuditDialogInvoice] = useState<Invoice | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Edit state
  const [editInvoiceId, setEditInvoiceId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editCustomerId, setEditCustomerId] = useState("");
  const [editCurrency, setEditCurrency] = useState("PKR");
  const [editPaymentMode, setEditPaymentMode] = useState("CR");
  const [editRemarks, setEditRemarks] = useState("");
  const [editInternalRemarks, setEditInternalRemarks] = useState("");
  const [editCustomerRemarks, setEditCustomerRemarks] = useState("");
  const [editVisitType, setEditVisitType] = useState("Visitor");
  const [editSpoId, setEditSpoId] = useState("");
  const [editSupplierId, setEditSupplierId] = useState("");
  const [editPrintName, setEditPrintName] = useState("");
  const [editAdjDate, setEditAdjDate] = useState("");
  const [editOurXo, setEditOurXo] = useState("");
  const [editClientXo, setEditClientXo] = useState("");
  const [editDocStatus, setEditDocStatus] = useState("Draft");
  const [editBsp, setEditBsp] = useState(false);
  const [editBspBillingPeriod, setEditBspBillingPeriod] = useState("");
  const [editLineItems, setEditLineItems] = useState<LineItemInput[]>([]);

  const loadAuditLogs = async (invoice: Invoice) => {
    setAuditDialogInvoice(invoice);
    setLoadingLogs(true);
    try {
      const res = await fetch(`/api/audit-log?entity_type=Invoice&entity_id=${invoice._id}`);
      const data = await res.json();
      setAuditLogs(data.audit_logs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const isManager = ["Owner", "Accountant"].includes((session?.user as { role?: string })?.role || "");

  // Load Invoices with Search and Filter Parameters
  const loadInvoices = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (typeFilter) params.set("type", typeFilter);
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    if (dateRangeFilter && dateRangeFilter !== "all") params.set("date_range", dateRangeFilter);
    if (paymentStatusFilter && paymentStatusFilter !== "all") params.set("payment_status", paymentStatusFilter);
    if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
    if (customerFilter && customerFilter !== "all") params.set("customer_id", customerFilter);

    const url = `/api/invoices?${params.toString()}`;
    const res = await fetch(url);
    const data = await res.json();
    setInvoices(data.invoices || []);
    setLoading(false);
  }, [typeFilter, searchQuery, dateRangeFilter, paymentStatusFilter, statusFilter, customerFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadInvoices();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadInvoices]);

  const loadCustomers = useCallback(() => {
    fetch("/api/customers").then((r) => r.json()).then((d) => setCustomers(d.customers || []));
  }, []);

  useEffect(() => {
    loadCustomers();
    fetch("/api/suppliers").then((r) => r.json()).then((d) => setSuppliers(d.suppliers || []));
    fetch("/api/users").then((r) => r.json()).then((d) => setStaffUsers(d.users || []));
  }, [loadCustomers]);

  // Helper functions to resolve display names
  const getCustomerName = (id: string) => {
    const c = customers.find((item) => item._id === id || item.name === id);
    return c ? `${c.name}${c.code ? ` (${c.code})` : ''}` : id ? id : "";
  };

  const getSupplierName = (id: string) => {
    const s = suppliers.find((item) => item._id === id);
    return s ? `${s.name}${s.code ? ` (${s.code})` : ''}` : id ? id : "BSP / Airline";
  };

  const getAgentName = (id: string) => {
    const u = staffUsers.find((item) => item._id === id);
    return u ? `${u.name} (${u.role})` : id ? id : "Booking Agent";
  };

  // Reset all filters
  const resetFilters = () => {
    setSearchQuery("");
    setDateRangeFilter("all");
    setPaymentStatusFilter("all");
    setStatusFilter("all");
    setCustomerFilter("all");
  };

  // Delete invoice
  async function confirmDeleteInvoice() {
    if (!deleteInvoiceId) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/invoices/${deleteInvoiceId}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteInvoiceId(null);
        loadInvoices();
      } else {
        const d = await res.json();
        alert(d.error || "Failed to delete invoice");
      }
    } catch (err) {
      console.error(err);
      alert("Error deleting invoice");
    } finally {
      setDeleteLoading(false);
    }
  }

  // Dual-Sided Travel Accounting Calculations (Live auto-calculation)
  function calculateTicketTotals(item: LineItemInput, lastEditedField?: string): LineItemInput {
    const baseFare = parseFloat(item.base_fare || "0") || 0;
    
    // Dynamic Airline City Tax Sum (Liability)
    const airlineCityTaxSum = (item.airline_city_taxes || []).reduce(
      (sum, t) => sum + (parseFloat(t.amount || "0") || 0), 0
    );

    // Dynamic City Tax Sum (Income/Service)
    const cityTaxSum = (item.city_taxes || []).reduce(
      (sum, t) => sum + (parseFloat(t.amount || "0") || 0), 0
    );

    let taxes = 0;
    if (item.trip_type === "Domestic") {
      // Domestic Fixed Taxes (SP, CED, PK, YR, PB, YQ, DOF, XZ, YD, YI, RN, etc.)
      taxes = (parseFloat(item.tax_sp || "0") || 0) +
        (parseFloat(item.tax_ced || "0") || 0) +
        (parseFloat(item.tax_pk || "0") || 0) +
        (parseFloat(item.tax_yr || "0") || 0) +
        (parseFloat(item.tax_pb || "0") || 0) +
        (parseFloat(item.tax_yq || "0") || 0) +
        (parseFloat(item.tax_dof || "0") || 0) +
        (parseFloat(item.tax_xz || "0") || 0) +
        (parseFloat(item.tax_yd || "0") || 0) +
        (parseFloat(item.tax_yi || "0") || 0) +
        (parseFloat(item.tax_rn || "0") || 0) +
        (parseFloat(item.tax_gst_dom || "0") || 0) +
        (parseFloat(item.tax_ast || "0") || 0) +
        (parseFloat(item.tax_apt || "0") || 0) +
        (parseFloat(item.other_taxes || "0") || 0) +
        airlineCityTaxSum +
        cityTaxSum;
    } else {
      // Fixed International Taxes (SP, RG, PK, YR, YQ, DOF, XZ, YD, YI, RN)
      taxes = (parseFloat(item.tax_sp || "0") || 0) +
        (parseFloat(item.tax_rg || "0") || 0) +
        (parseFloat(item.tax_pk || "0") || 0) +
        (parseFloat(item.tax_yr || "0") || 0) +
        (parseFloat(item.tax_yq || "0") || 0) +
        (parseFloat(item.tax_dof || "0") || 0) +
        (parseFloat(item.tax_xz || "0") || 0) +
        (parseFloat(item.tax_yd || "0") || 0) +
        (parseFloat(item.tax_yi || "0") || 0) +
        (parseFloat(item.tax_rn || "0") || 0) +
        (parseFloat(item.tax_apt || "0") || 0) +
        (parseFloat(item.tax_kbr || "0") || 0) +
        (parseFloat(item.tax_kbp || "0") || 0) +
        (parseFloat(item.tax_pb || "0") || 0) +
        (parseFloat(item.other_taxes || "0") || 0) +
        airlineCityTaxSum +
        cityTaxSum;
    }

    const grossFare = baseFare + taxes;
    const fareBase = baseFare > 0 ? baseFare : grossFare;
    
    const updated = { ...item };

    // Helper for bidirectional calculation (% <-> Amount)
    const calcPair = (
      pctField: keyof LineItemInput,
      amtField: keyof LineItemInput,
      base: number
    ) => {
      const u = updated as Record<string, any>;
      let pct = parseFloat(String(u[pctField] || "0")) || 0;
      let amt = parseFloat(String(u[amtField] || "0")) || 0;

      if (lastEditedField === amtField) {
        pct = base > 0 ? (amt / base) * 100 : 0;
        u[pctField] = pct > 0 ? (pct % 1 === 0 ? pct.toString() : pct.toFixed(2)) : "";
      } else if (lastEditedField === pctField) {
        amt = (base * pct) / 100;
        u[amtField] = amt > 0 ? (amt % 1 === 0 ? amt.toString() : amt.toFixed(2)) : "0.00";
      } else {
        if (pct === 0 && amt > 0) {
          pct = base > 0 ? (amt / base) * 100 : 0;
          u[pctField] = pct > 0 ? (pct % 1 === 0 ? pct.toString() : pct.toFixed(2)) : "";
        } else if (pct > 0) {
          amt = (base * pct) / 100;
          u[amtField] = amt > 0 ? (amt % 1 === 0 ? amt.toString() : amt.toFixed(2)) : "0.00";
        }
      }
      return { pct, amt };
    };

    // 1. Commission on Base Fare (COM)
    const { amt: commAmt } = calcPair("commission_percent", "commission_amount", fareBase);

    // 2. Withholding Tax on Commission (WHT)
    const { amt: whtAmt } = calcPair("wht_percent", "wht_amount", commAmt);

    // 3. Discount 1 (DIS)
    const { amt: disAmt } = calcPair("discount_percent", "discount_amount", fareBase);

    // 4. Discount 2 (DIS2)
    const { amt: dis2Amt } = calcPair("discount2_percent", "discount2_amount", fareBase);

    // 5. Passenger Service Fee % (PSF/P)
    const { amt: psfPAmt } = calcPair("psf_p_percent", "psf_p_amount", fareBase);

    // 5b. Passenger Service Fee (PSF)
    const { amt: psfAmt } = calcPair("psf_percent", "psf_amount", fareBase);

    const totalPsf = psfPAmt + psfAmt;

    // 6. GST on PSF/service fee (GST)
    const { amt: gstAmt } = calcPair("gst_percent", "gst_amount", totalPsf > 0 ? totalPsf : fareBase);

    // 7. SEG (Segment Fee)
    const { amt: segAmt } = calcPair("seg_percent", "seg_amount", fareBase);

    // 8. WHT_C (Customer Withholding Tax)
    const { amt: whtCAmt } = calcPair("wht_c_percent", "wht_c_amount", fareBase);

    const customerGross = grossFare + totalPsf + segAmt;
    const customerNet = customerGross - disAmt - dis2Amt + gstAmt + whtCAmt;

    const supplierGross = grossFare;
    const supplierNet = supplierGross - commAmt + whtAmt;
    const supplierGrossWoWht = supplierGross - whtAmt;

    const margin = customerNet - supplierNet;

    return {
      ...updated,
      customer_gross: Math.round(customerGross),
      customer_net: Math.round(customerNet),
      supplier_gross: Math.round(supplierGross),
      supplier_net: Math.round(supplierNet),
      supplier_gross_wo_wht: Math.round(supplierGrossWoWht),
      agency_margin: Math.round(margin),
      amount: String(Math.round(customerNet)),
    };
  }

  const DUPLICATE_TICKET_MSG = "This ticket number has already been used and cannot be used again. To find the existing ticket, please search for it in the search box.";

  async function checkAndWarnDuplicateTicket(ticketNo: string, isEdit = false, currentIndex = 0): Promise<boolean> {
    if (!ticketNo || !ticketNo.trim()) return false;
    const clean = ticketNo.trim();
    const list = isEdit ? editLineItems : lineItems;

    // 1. Check local duplicate within current form tabs
    const isLocalDuplicate = list.some((item, idx) => idx !== currentIndex && item.ticket_number && item.ticket_number.trim() === clean);
    if (isLocalDuplicate) {
      alert(DUPLICATE_TICKET_MSG);
      return true;
    }

    // 2. Check duplicate in database via API
    try {
      const excludeId = isEdit ? editInvoiceId || "" : "";
      const res = await fetch(`/api/invoices/check-ticket?ticket_number=${encodeURIComponent(clean)}&exclude_invoice_id=${excludeId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.exists) {
          alert(DUPLICATE_TICKET_MSG);
          return true;
        }
      }
    } catch (err) {
      console.error("Ticket uniqueness check failed:", err);
    }
    return false;
  }

  function updateTicketLineItem(index: number, field: string, value: unknown, isEdit = false) {
    const list = isEdit ? [...editLineItems] : [...lineItems];
    let item = { ...list[index], [field]: value };

    // Auto-format ticket number and auto-detect airline
    if (field === "ticket_number" && typeof value === "string") {
      const formatted = formatTicketNumber(value);
      item.ticket_number = formatted;
      const detectedAirline = getAirlineByTicketNumber(formatted);
      if (detectedAirline) {
        item.airline_name = detectedAirline.name;
        item.airline_code = detectedAirline.code;
      }
      if (formatted && formatted.length >= 3) {
        checkAndWarnDuplicateTicket(formatted, isEdit, index);
      }
    }

    if (field === "conjunction_ticket_no" && typeof value === "string") {
      item.conjunction_ticket_no = formatTicketNumber(value);
    }

    if (item.auto_update !== false) {
      item = calculateTicketTotals(item, field);
    }
    list[index] = item;
    if (isEdit) setEditLineItems(list);
    else setLineItems(list);
  }

  // Flight Segments Helpers (Max 5 Legs)
  function addFlightSegment(index: number, isEdit = false) {
    const list = isEdit ? [...editLineItems] : [...lineItems];
    const segs = [...(list[index].flight_segments || [])];
    if (segs.length >= 5) return; // Max 5 legs per ticket
    segs.push({ city: "", flight_no: "", booking_class: "Y", dep_date: "", dep_time: "", arr_time: "" });
    list[index] = { ...list[index], flight_segments: segs };
    if (isEdit) setEditLineItems(list);
    else setLineItems(list);
  }

  function updateFlightSegment(lineIdx: number, segIdx: number, field: keyof FlightSegment, value: string, isEdit = false) {
    const list = isEdit ? [...editLineItems] : [...lineItems];
    const segs = [...(list[lineIdx].flight_segments || [])];
    segs[segIdx] = { ...segs[segIdx], [field]: value };
    list[lineIdx] = { ...list[lineIdx], flight_segments: segs };
    if (isEdit) setEditLineItems(list);
    else setLineItems(list);
  }

  function removeFlightSegment(lineIdx: number, segIdx: number, isEdit = false) {
    const list = isEdit ? [...editLineItems] : [...lineItems];
    const segs = (list[lineIdx].flight_segments || []).filter((_, i) => i !== segIdx);
    list[lineIdx] = { ...list[lineIdx], flight_segments: segs };
    if (isEdit) setEditLineItems(list);
    else setLineItems(list);
  }

  // Dynamic Airline City Tax Helpers
  function addAirlineCityTax(itemIdx: number, isEdit = false) {
    const list = isEdit ? [...editLineItems] : [...lineItems];
    const current = [...(list[itemIdx].airline_city_taxes || [])];
    current.push({ code: "XT", amount: "0" });
    list[itemIdx] = calculateTicketTotals({ ...list[itemIdx], airline_city_taxes: current });
    if (isEdit) setEditLineItems(list);
    else setLineItems(list);
  }

  function removeAirlineCityTax(itemIdx: number, taxIdx: number, isEdit = false) {
    const list = isEdit ? [...editLineItems] : [...lineItems];
    const current = (list[itemIdx].airline_city_taxes || []).filter((_, i) => i !== taxIdx);
    list[itemIdx] = calculateTicketTotals({ ...list[itemIdx], airline_city_taxes: current });
    if (isEdit) setEditLineItems(list);
    else setLineItems(list);
  }

  function updateAirlineCityTax(itemIdx: number, taxIdx: number, field: "code" | "amount", val: string, isEdit = false) {
    const list = isEdit ? [...editLineItems] : [...lineItems];
    const current = [...(list[itemIdx].airline_city_taxes || [])];
    current[taxIdx] = { ...current[taxIdx], [field]: val };
    list[itemIdx] = calculateTicketTotals({ ...list[itemIdx], airline_city_taxes: current });
    if (isEdit) setEditLineItems(list);
    else setLineItems(list);
  }

  // Dynamic City Tax Helpers
  function addCityTax(itemIdx: number, isEdit = false) {
    const list = isEdit ? [...editLineItems] : [...lineItems];
    const current = [...(list[itemIdx].city_taxes || [])];
    current.push({ code: "City Tax", amount: "0" });
    list[itemIdx] = calculateTicketTotals({ ...list[itemIdx], city_taxes: current });
    if (isEdit) setEditLineItems(list);
    else setLineItems(list);
  }

  function removeCityTax(itemIdx: number, taxIdx: number, isEdit = false) {
    const list = isEdit ? [...editLineItems] : [...lineItems];
    const current = (list[itemIdx].city_taxes || []).filter((_, i) => i !== taxIdx);
    list[itemIdx] = calculateTicketTotals({ ...list[itemIdx], city_taxes: current });
    if (isEdit) setEditLineItems(list);
    else setLineItems(list);
  }

  function updateCityTax(itemIdx: number, taxIdx: number, field: "code" | "amount", val: string, isEdit = false) {
    const list = isEdit ? [...editLineItems] : [...lineItems];
    const current = [...(list[itemIdx].city_taxes || [])];
    current[taxIdx] = { ...current[taxIdx], [field]: val };
    list[itemIdx] = calculateTicketTotals({ ...list[itemIdx], city_taxes: current });
    if (isEdit) setEditLineItems(list);
    else setLineItems(list);
  }

  function duplicateTicket(itemIdx: number, isEdit = false) {
    const list = isEdit ? editLineItems : lineItems;
    const sourceItem = list[itemIdx];
    if (!sourceItem) return;

    const cloned: LineItemInput = JSON.parse(JSON.stringify(sourceItem));
    cloned.pax_name = "";
    cloned.passport_no = "";
    cloned.passport_issue_date = "";
    cloned.ticket_number = incrementTicketNumber(sourceItem.ticket_number || "");
    cloned.conjunction_ticket_no = sourceItem.conjunction_ticket_no ? incrementTicketNumber(sourceItem.conjunction_ticket_no) : "";

    if (isEdit) {
      setEditLineItems((prev) => [...prev, cloned]);
      setActiveEditTicketTab(list.length);
    } else {
      setLineItems((prev) => [...prev, cloned]);
      setActiveTicketTab(list.length);
    }
  }

  async function createInvoice(): Promise<string | null> {
    if (isCreating) return null;
    setIsCreating(true);
    try {
      if ((newDocStatus || "Draft") === "Posted") {
        const valErrors = validateInvoiceForPosting({
          inv_date: newInvDate,
          customer_id: newCustomerId,
          print_name: newPrintName,
          visit_type: newVisitType,
          payment_mode: newPaymentMode,
          line_items: lineItems,
        });
        if (valErrors.length > 0) {
          alert(`Cannot post invoice. Please fill in all compulsory (*) fields:\n\n• ${valErrors.join("\n• ")}`);
          setIsCreating(false);
          return null;
        }
      }

      // Validate ticket numbers uniqueness before submitting
      for (let i = 0; i < lineItems.length; i++) {
        const t = lineItems[i].ticket_number;
        if (t && t.trim()) {
          const isDup = await checkAndWarnDuplicateTicket(t.trim(), false, i);
          if (isDup) {
            setIsCreating(false);
            return null;
          }
        }
      }

      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: newCustomerId,
          currency: newCurrency,
          bsp_flag: newBsp,
          bsp_billing_period: newBspBillingPeriod || null,
          payment_mode: newPaymentMode,
          remarks: newInternalRemarks || newRemarks || "",
          internal_remarks: newInternalRemarks,
          customer_remarks: newCustomerRemarks,
          visit_type: newVisitType,
          spo_id: newSpoId || null,
          supplier_id: newSupplierId || null,
          print_name: newPrintName,
          adj_date: newAdjDate,
          our_xo: newOurXo,
          client_xo: newClientXo,
          status: newDocStatus || "Draft",
          line_items: lineItems,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const createdInv = data.invoice;
        setShowNew(false);
        if (createdInv && createdInv._id) {
          openEditDialog(createdInv);
        }
        loadInvoices();
        return createdInv?._id || null;
      } else {
        const d = await res.json();
        alert(d.error || "Failed to create invoice");
        return null;
      }
    } catch (err) {
      console.error(err);
      alert("An unexpected error occurred while creating invoice.");
      return null;
    } finally {
      setIsCreating(false);
    }
  }

  async function postInvoice(id: string) {
    if (editInvoiceId === id) {
      const valErrors = validateInvoiceForPosting({
        inv_date: "valid",
        customer_id: editCustomerId,
        print_name: editPrintName,
        visit_type: editVisitType,
        payment_mode: editPaymentMode,
        line_items: editLineItems,
      });
      if (valErrors.length > 0) {
        alert(`Cannot post invoice. Please fill in all compulsory (*) fields:\n\n• ${valErrors.join("\n• ")}`);
        return;
      }
    }
    const res = await fetch(`/api/invoices/${id}/post`, { method: "POST" });
    if (res.ok) {
      if (editInvoiceId === id) {
        setEditDocStatus("Posted");
      }
      loadInvoices();
    } else {
      const d = await res.json();
      alert(d.error || "Failed to post invoice");
    }
  }

  async function unpostInvoice(id: string) {
    const res = await fetch(`/api/invoices/${id}/unpost`, { method: "POST" });
    if (res.ok) {
      if (editInvoiceId === id) {
        setEditDocStatus("Draft");
      }
      loadInvoices();
    } else {
      const d = await res.json();
      alert(d.error || "Failed to unpost invoice");
    }
  }

  async function voidInvoice() {
    if (!voidDialog) return;
    const res = await fetch(`/api/invoices/${voidDialog}/void`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: voidReason }) });
    if (!res.ok) { const d = await res.json(); alert(d.error); }
    setVoidDialog(null); setVoidReason(""); loadInvoices();
  }

  async function issueCreditNote() {
    if (!creditDialog) return;
    const res = await fetch(`/api/invoices/${creditDialog}/credit-notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: parseFloat(creditAmount), reason: creditReason }) });
    if (!res.ok) { const d = await res.json(); alert(d.error); }
    setCreditDialog(null); setCreditAmount(""); setCreditReason(""); loadInvoices();
  }

  async function openEditDialog(inv: Invoice) {
    setEditInvoiceId(inv._id);
    setEditLoading(true);
    const res = await fetch(`/api/invoices/${inv._id}`);
    const data = await res.json();
    const customerId = typeof inv.customer_id === "object" ? inv.customer_id._id : inv.customer_id;
    setEditCustomerId(customerId);
    setEditCurrency(inv.currency);
    setEditBsp(inv.bsp_flag);
    setEditPaymentMode(data.invoice?.payment_mode || "CR");
    setEditRemarks(data.invoice?.remarks || "");
    setEditInternalRemarks(data.invoice?.internal_remarks || data.invoice?.remarks || "");
    setEditCustomerRemarks(data.invoice?.customer_remarks || "");
    setEditVisitType(data.invoice?.visit_type || "Visitor");
    setEditSpoId(data.invoice?.spo_id?._id || data.invoice?.spo_id || "");
    setEditSupplierId(data.invoice?.supplier_id?._id || data.invoice?.supplier_id || "");
    setEditPrintName(data.invoice?.print_name || "");
    setEditAdjDate(data.invoice?.adj_date ? new Date(data.invoice.adj_date).toISOString().split("T")[0] : "");
    setEditOurXo(data.invoice?.our_xo || "E");
    setEditClientXo(data.invoice?.client_xo || "");
    setEditDocStatus(data.invoice?.status || "Draft");

    const items: LineItemInput[] = (data.line_items || []).map((li: Record<string, unknown>) => ({
      service_type: String(li.service_type || "Ticket"),
      description: String(li.description || ""),
      amount: String(li.amount),
      commission_override_rate: li.commission_override_rate ? String(li.commission_override_rate) : "",
      tax_code_id: li.tax_code_id && typeof li.tax_code_id === "object" && "_id" in (li.tax_code_id as object) ? String((li.tax_code_id as { _id: unknown })._id) : String(li.tax_code_id || ""),
      pax_name: String(li.pax_name || ""),
      pax_type: String(li.pax_type || "A"),
      passport_no: String(li.passport_no || ""),
      passport_issue_date: String(li.passport_issue_date || ""),
      ticket_number: String(li.ticket_number || ""),
      conjunction_ticket_no: String(li.conjunction_ticket_no || ""),
      conjunction_route: String(li.conjunction_route || ""),
      conjunction_city: String(li.conjunction_city || ""),
      conjunction_flight_no: String(li.conjunction_flight_no || ""),
      conjunction_booking_class: String(li.conjunction_booking_class || "Y"),
      conjunction_dep_date: String(li.conjunction_dep_date || ""),
      conjunction_arr_date: String(li.conjunction_arr_date || ""),
      conjunction_dep_time: String(li.conjunction_dep_time || ""),
      conjunction_arr_time: String(li.conjunction_arr_time || ""),
      gds_pnr: String(li.gds_pnr || ""),
      gds_name: String(li.gds_name || "Amadeus"),
      airline_name: String(li.airline_name || ""),
      airline_code: String(li.airline_code || ""),
      sector: String(li.sector || ""),
      trip_type: String(li.trip_type || "International"),
      doc_type: String(li.doc_type || "BSPD"),
      tour_code: String(li.tour_code || ""),
      issue_date: String(li.issue_date || ""),
      our_xo: String(li.our_xo || "E"),
      customer_remarks: String(li.customer_remarks || ""),
      flight_segments: Array.isArray(li.flight_segments) ? (li.flight_segments as FlightSegment[]) : [],
      airline_city_taxes: Array.isArray(li.airline_city_taxes) ? (li.airline_city_taxes as DynamicTaxItem[]) : [{ code: "XT", amount: "0" }],
      city_taxes: Array.isArray(li.city_taxes) ? (li.city_taxes as DynamicTaxItem[]) : [{ code: "City Tax", amount: "0" }],
      base_fare: String(li.base_fare || "0"),
      tax_sp: String(li.tax_sp || "0"),
      tax_dof: String(li.tax_dof || "0"),
      tax_yq: String(li.tax_yq || "0"),
      tax_yr: String(li.tax_yr || "0"),
      tax_rg: String(li.tax_rg || "0"),
      tax_pk: String(li.tax_pk || "0"),
      tax_apt: String(li.tax_apt || "0"),
      tax_kbr: String(li.tax_kbr || "0"),
      tax_kbp: String(li.tax_kbp || "0"),
      tax_pb: String(li.tax_pb || "0"),
      tax_xz: String(li.tax_xz || "0"),
      tax_yd: String(li.tax_yd || "0"),
      tax_yi: String(li.tax_yi || "0"),
      tax_rn: String(li.tax_rn || "0"),
      tax_city: String(li.tax_city || "0"),
      tax_airline_city: String(li.tax_airline_city || "0"),
      other_taxes: String(li.other_taxes || "0"),
      tax_ced: String(li.tax_ced || "0"),
      tax_gst_dom: String(li.tax_gst_dom || "0"),
      tax_ast: String(li.tax_ast || "0"),
      wht_percent: String(li.wht_percent || "12"),
      wht_amount: String(li.wht_amount || "0"),
      commission_percent: String(li.commission_percent || "0"),
      commission_amount: String(li.commission_amount || "0"),
      discount_percent: String(li.discount_percent || "0"),
      discount_amount: String(li.discount_amount || "0"),
      discount2_percent: String(li.discount2_percent || "0"),
      discount2_amount: String(li.discount2_amount || "0"),
      psf_p_percent: String(li.psf_p_percent || "0"),
      psf_p_amount: String(li.psf_p_amount || "0"),
      psf_percent: String(li.psf_percent || "0"),
      psf_amount: String(li.psf_amount || "0"),
      gst_percent: String(li.gst_percent || "5"),
      gst_amount: String(li.gst_amount || "0"),
      seg_percent: String(li.seg_percent || "0"),
      seg_amount: String(li.seg_amount || "0"),
      wht_c_percent: String(li.wht_c_percent || "0"),
      wht_c_amount: String(li.wht_c_amount || "0"),
      auto_update: li.auto_update !== undefined ? Boolean(li.auto_update) : true,
      cancellation_charges_self: String(li.cancellation_charges_self || "0"),
      cancellation_charges_supplier: String(li.cancellation_charges_supplier || "0"),
      supplier_id: li.supplier_id && typeof li.supplier_id === "object" && "_id" in (li.supplier_id as object) ? String((li.supplier_id as { _id: unknown })._id) : String(li.supplier_id || ""),
      customer_gross: Number(li.customer_gross) || 0,
      customer_net: Number(li.customer_net) || Number(li.amount) || 0,
      supplier_gross: Number(li.supplier_gross) || 0,
      supplier_net: Number(li.supplier_net) || 0,
      supplier_gross_wo_wht: Number(li.supplier_gross_wo_wht) || 0,
      agency_margin: Number(li.agency_margin) || 0,
    }));
    setEditLineItems(items.length > 0 ? items : [createDefaultTicketItem()]);
    setActiveEditTicketTab(0);
    setEditLoading(false);
  }

  async function saveEditInvoice(): Promise<boolean> {
    if (!editInvoiceId || isSavingEdit) return false;
    setIsSavingEdit(true);
    try {
      if (editDocStatus === "Posted") {
        const valErrors = validateInvoiceForPosting({
          inv_date: "valid",
          customer_id: editCustomerId,
          print_name: editPrintName,
          visit_type: editVisitType,
          payment_mode: editPaymentMode,
          line_items: editLineItems,
        });
        if (valErrors.length > 0) {
          alert(`Cannot post invoice. Please fill in all compulsory (*) fields:\n\n• ${valErrors.join("\n• ")}`);
          setIsSavingEdit(false);
          return false;
        }
      }

      // Validate ticket numbers uniqueness before saving edits
      for (let i = 0; i < editLineItems.length; i++) {
        const t = editLineItems[i].ticket_number;
        if (t && t.trim()) {
          const isDup = await checkAndWarnDuplicateTicket(t.trim(), true, i);
          if (isDup) {
            setIsSavingEdit(false);
            return false;
          }
        }
      }

      const res = await fetch(`/api/invoices/${editInvoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: editCustomerId,
          currency: editCurrency,
          bsp_flag: editBsp,
          bsp_billing_period: editBspBillingPeriod || null,
          payment_mode: editPaymentMode,
          remarks: editInternalRemarks || editRemarks || "",
          internal_remarks: editInternalRemarks,
          customer_remarks: editCustomerRemarks,
          visit_type: editVisitType,
          spo_id: editSpoId || null,
          supplier_id: editSupplierId || null,
          print_name: editPrintName,
          adj_date: editAdjDate,
          our_xo: editOurXo,
          client_xo: editClientXo,
          status: editDocStatus,
          line_items: editLineItems,
        }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Failed to save"); return false; }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      loadInvoices();
      return true;
    } catch (err) {
      console.error(err);
      alert("Error saving invoice changes");
      return false;
    } finally {
      setIsSavingEdit(false);
    }
  }

  const statusStyles: Record<string, string> = {
    Draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    Confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
    Posted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    Voided: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  };

  const paymentStyles: Record<string, string> = {
    Paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800/60",
    Partial: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-300 dark:border-amber-800/60",
    Unpaid: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-300 dark:border-rose-800/60",
  };

  // Render Ticket Booking Form
  const renderTicketForm = (item: LineItemInput, itemIdx: number, isEdit = false) => {
    const isDomestic = item.trip_type === "Domestic";

    return (
      <div className="space-y-4 text-[12px] bg-slate-50/50 dark:bg-[#0c0c0e] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-inner">
        {/* Passenger & Ticket Main Details */}
        <div className="p-3 bg-white dark:bg-[#111113] rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="font-bold text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b pb-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>Passenger &amp; Ticketing Information</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[11px] font-semibold gap-1 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                onClick={() => duplicateTicket(itemIdx, isEdit)}
                title="Duplicate active ticket data to a new ticket (excluding passenger name and ticket number)"
              >
                <Copy className="h-3 w-3" /> Duplicate Ticket
              </Button>
            </div>
            <span className="font-mono text-primary font-bold">{item.airline_name || "Airline Booking"}</span>
          </div>

          {/* Row 1: Pax, Pax Type, GDS, PP No, PP Issue Dt */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-12 sm:col-span-6 lg:col-span-4 space-y-1">
              <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Pax *</Label>
              <Input
                placeholder="MR. First Name Last Name"
                value={item.pax_name || ""}
                onChange={(e) => updateTicketLineItem(itemIdx, "pax_name", e.target.value.toUpperCase(), isEdit)}
                className="h-8 text-[12px] uppercase font-semibold bg-white dark:bg-[#161619]"
              />
            </div>
            <div className="col-span-6 sm:col-span-3 lg:col-span-2 space-y-1">
              <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Pax Type *</Label>
              <Select value={item.pax_type || "A"} onValueChange={(v) => updateTicketLineItem(itemIdx, "pax_type", v || "A", isEdit)}>
                <SelectTrigger className="h-8 text-[12px] bg-white dark:bg-[#161619]">
                  <SelectValue>
                    {(val) => val === "A" ? "Adult (A)" : val === "C" ? "Child (C)" : val === "I" ? "Infant (I)" : val || "Adult (A)"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Adult (A)</SelectItem>
                  <SelectItem value="C">Child (C)</SelectItem>
                  <SelectItem value="I">Infant (I)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-6 sm:col-span-3 lg:col-span-2 space-y-1">
              <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">GDS</Label>
              <Select value={item.gds_name || "Amadeus"} onValueChange={(v) => updateTicketLineItem(itemIdx, "gds_name", v || "Amadeus", isEdit)}>
                <SelectTrigger className="h-8 text-[12px] bg-white dark:bg-[#161619]">
                  <SelectValue>{(val) => val || "Amadeus"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Amadeus">Amadeus</SelectItem>
                  <SelectItem value="Sabre">Sabre</SelectItem>
                  <SelectItem value="Galileo">Galileo</SelectItem>
                  <SelectItem value="Worldspan">Worldspan</SelectItem>
                  <SelectItem value="Direct">Direct Portal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-6 sm:col-span-3 lg:col-span-2 space-y-1">
              <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">PP No.</Label>
              <Input
                placeholder="e.g. AB1234567"
                value={item.passport_no || ""}
                onChange={(e) => updateTicketLineItem(itemIdx, "passport_no", e.target.value.toUpperCase(), isEdit)}
                className="h-8 text-[12px] uppercase bg-white dark:bg-[#161619]"
              />
            </div>
            <div className="col-span-6 sm:col-span-3 lg:col-span-2 space-y-1">
              <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">PP Issue Dt</Label>
              <Input
                type="date"
                value={item.passport_issue_date || ""}
                onChange={(e) => updateTicketLineItem(itemIdx, "passport_issue_date", e.target.value, isEdit)}
                className="h-8 text-[12px] bg-white dark:bg-[#161619]"
              />
            </div>
          </div>

          {/* Row 2: All 7 Ticketing Fields in Single Row */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-12 sm:col-span-4 lg:col-span-3 space-y-1">
              <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Ticket No. (3-4-3-3) *</Label>
              <Input
                placeholder="000-0000-000-000"
                value={item.ticket_number || ""}
                onChange={(e) => updateTicketLineItem(itemIdx, "ticket_number", e.target.value, isEdit)}
                className="h-8 text-[12px] font-mono font-bold tracking-tight bg-white dark:bg-[#161619]"
              />
            </div>
            <div className="col-span-6 sm:col-span-2 lg:col-span-1 space-y-1">
              <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">PNR</Label>
              <Input
                placeholder="e.g. ABC123"
                value={item.gds_pnr || ""}
                onChange={(e) => updateTicketLineItem(itemIdx, "gds_pnr", e.target.value.toUpperCase(), isEdit)}
                className="h-8 text-[12px] font-mono uppercase font-bold text-blue-600 bg-white dark:bg-[#161619]"
              />
            </div>
            <div className="col-span-6 sm:col-span-3 lg:col-span-2 space-y-1">
              <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Airline *</Label>
              <Input
                placeholder="Auto-detected or QATAR"
                value={item.airline_name || ""}
                onChange={(e) => updateTicketLineItem(itemIdx, "airline_name", e.target.value.toUpperCase(), isEdit)}
                className="h-8 text-[12px] uppercase bg-white dark:bg-[#161619]"
              />
            </div>
            <div className="col-span-6 sm:col-span-3 lg:col-span-2 space-y-1">
              <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Supplier / BSP *</Label>
              <Select
                value={item.supplier_id || (isEdit ? editSupplierId : newSupplierId) || ""}
                onValueChange={(v) => {
                  const val = v || "";
                  updateTicketLineItem(itemIdx, "supplier_id", val, isEdit);
                  if (isEdit) setEditSupplierId(val);
                  else setNewSupplierId(val);
                }}
              >
                <SelectTrigger className="h-8 text-[12px] bg-white dark:bg-[#161619]">
                  <SelectValue placeholder="BSP / Airline">
                    {(val) => getSupplierName(val)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name} {s.code ? `(${s.code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-6 sm:col-span-4 lg:col-span-2 space-y-1">
              <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Sector *</Label>
              <Input
                placeholder="ORG / ORG-DST"
                value={item.sector || ""}
                onChange={(e) => updateTicketLineItem(itemIdx, "sector", e.target.value.toUpperCase(), isEdit)}
                className="h-8 text-[12px] uppercase font-mono bg-white dark:bg-[#161619]"
              />
            </div>
            <div className="col-span-3 sm:col-span-2 lg:col-span-1 space-y-1">
              <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Doc *</Label>
              <Select value={item.doc_type || "BSPD"} onValueChange={(v) => updateTicketLineItem(itemIdx, "doc_type", v || "BSPD", isEdit)}>
                <SelectTrigger className="h-8 text-[12px] bg-white dark:bg-[#161619] px-2 text-[11px]">
                  <SelectValue>{(val) => val || "BSPD"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BSPD">BSPD</SelectItem>
                  <SelectItem value="E-Ticket">E-Ticket</SelectItem>
                  <SelectItem value="MCO">MCO</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-3 sm:col-span-2 lg:col-span-1 space-y-1">
              <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Type *</Label>
              <Select value={item.trip_type || "International"} onValueChange={(v) => updateTicketLineItem(itemIdx, "trip_type", v || "International", isEdit)}>
                <SelectTrigger className="h-8 text-[12px] bg-white dark:bg-[#161619] px-2 text-[11px]">
                  <SelectValue>{(val) => val === "International" ? "I (Int)" : "D (Dom)"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="International">International (I)</SelectItem>
                  <SelectItem value="Domestic">Domestic (D)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* 2-Column Split: Left Box vs Right Box */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* LEFT BOX (Routing & Segments Table + Conjunction Ticket) */}
          <div className="lg:col-span-6 space-y-3.5 flex flex-col gap-3">
            {/* Flight Segments Table (Max 5 Legs) */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-[#111113]">
              <div className="bg-slate-100 dark:bg-slate-900 px-3 py-1.5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Plane className="h-3.5 w-3.5 text-blue-600" /> Flight Routing &amp; Segments ({item.flight_segments?.length || 0}/5 Legs)
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={(item.flight_segments || []).length >= 5}
                  className="h-6 text-[10px] px-2 gap-1 bg-white dark:bg-slate-800 disabled:opacity-50"
                  onClick={() => addFlightSegment(itemIdx, isEdit)}
                >
                  <Plus className="h-2.5 w-2.5" /> Add Leg
                </Button>
              </div>
              <div className="w-full">
                <table className="w-full text-[11px] table-auto">
                  <thead className="bg-slate-50 dark:bg-[#161618] border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                    <tr>
                      <th className="p-1.5 text-left w-20">City</th>
                      <th className="p-1.5 text-left w-14">Fl.No</th>
                      <th className="p-1.5 text-left w-10">Cl</th>
                      <th className="p-1.5 text-left w-24">Dep. Date</th>
                      <th className="p-1.5 text-left w-20">Dep. Time</th>
                      <th className="p-1.5 text-left w-24">Arr. Date</th>
                      <th className="p-1.5 text-left w-20">Arr. Time</th>
                      <th className="p-1.5 text-center w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(item.flight_segments || []).map((seg, segIdx) => (
                      <tr key={segIdx} className="border-b border-slate-100 dark:border-slate-800/60">
                        <td className="p-1">
                          <Input
                            placeholder="XXX"
                            value={seg.city}
                            list="city-airport-options"
                            onChange={(e) => updateFlightSegment(itemIdx, segIdx, "city", e.target.value.toUpperCase(), isEdit)}
                            className="h-7 text-[11px] uppercase font-mono w-full bg-transparent"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            placeholder="000"
                            value={seg.flight_no}
                            onChange={(e) => updateFlightSegment(itemIdx, segIdx, "flight_no", e.target.value, isEdit)}
                            className="h-7 text-[11px] w-full bg-transparent"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            placeholder="Y"
                            value={seg.booking_class}
                            onChange={(e) => updateFlightSegment(itemIdx, segIdx, "booking_class", e.target.value.toUpperCase(), isEdit)}
                            className="h-7 text-[11px] uppercase font-mono w-full text-center bg-transparent"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            type="date"
                            value={seg.dep_date || ""}
                            onChange={(e) => updateFlightSegment(itemIdx, segIdx, "dep_date", e.target.value, isEdit)}
                            className="h-7 text-[11px] w-full bg-transparent"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            type="time"
                            step={60}
                            value={seg.dep_time || ""}
                            onChange={(e) => updateFlightSegment(itemIdx, segIdx, "dep_time", e.target.value, isEdit)}
                            className="h-7 text-[11px] font-mono w-full bg-transparent cursor-pointer"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            type="date"
                            value={seg.arr_date || ""}
                            onChange={(e) => updateFlightSegment(itemIdx, segIdx, "arr_date", e.target.value, isEdit)}
                            className="h-7 text-[11px] w-full bg-transparent"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            type="time"
                            step={60}
                            value={seg.arr_time || ""}
                            onChange={(e) => updateFlightSegment(itemIdx, segIdx, "arr_time", e.target.value, isEdit)}
                            className="h-7 text-[11px] font-mono w-full bg-transparent cursor-pointer"
                          />
                        </td>
                        <td className="p-1 text-center">
                          {(item.flight_segments || []).length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeFlightSegment(itemIdx, segIdx, isEdit)}
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
              </div>
            </div>

            {/* Conjunction Ticket Box (6th Leg / Extended Routing with full leg fields) */}
            <div className="p-3 bg-white dark:bg-[#111113] rounded-lg border border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="font-bold text-[11px] text-blue-600 dark:text-blue-400 border-b pb-1 flex justify-between">
                <span>Conjunction Ticket (6th Leg / Extended Routing)</span>
                <span className="text-[10px] text-slate-400 font-normal">Full secondary leg data</span>
              </div>
              <div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500 font-semibold">Conjunction Ticket No. (3-4-3-3)</Label>
                  <Input
                    placeholder="000-0000-000-000"
                    value={item.conjunction_ticket_no || ""}
                    onChange={(e) => updateTicketLineItem(itemIdx, "conjunction_ticket_no", e.target.value, isEdit)}
                    className="h-7 text-[11px] font-mono bg-white dark:bg-[#161619] max-w-xs"
                  />
                </div>
              </div>

              {/* Conjunction Leg Details (All Fields) */}
              <div className="grid grid-cols-2 sm:grid-cols-7 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-1">
                  <Label className="text-[9px] text-slate-500">6th City</Label>
                  <Input
                    placeholder="XXX"
                    list="city-airport-options"
                    value={item.conjunction_city || ""}
                    onChange={(e) => updateTicketLineItem(itemIdx, "conjunction_city", e.target.value.toUpperCase(), isEdit)}
                    className="h-6 text-[10px] uppercase font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] text-slate-500">Fl.No</Label>
                  <Input
                    placeholder="000"
                    value={item.conjunction_flight_no || ""}
                    onChange={(e) => updateTicketLineItem(itemIdx, "conjunction_flight_no", e.target.value, isEdit)}
                    className="h-6 text-[10px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] text-slate-500">Cl</Label>
                  <Input
                    placeholder="Y"
                    value={item.conjunction_booking_class || ""}
                    onChange={(e) => updateTicketLineItem(itemIdx, "conjunction_booking_class", e.target.value.toUpperCase(), isEdit)}
                    className="h-6 text-[10px] font-mono uppercase text-center"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] text-slate-500">Dep. Date</Label>
                  <Input
                    type="date"
                    value={item.conjunction_dep_date || ""}
                    onChange={(e) => updateTicketLineItem(itemIdx, "conjunction_dep_date", e.target.value, isEdit)}
                    className="h-6 text-[10px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] text-slate-500">Dep. Time</Label>
                  <Input
                    type="time"
                    step={60}
                    value={item.conjunction_dep_time || ""}
                    onChange={(e) => updateTicketLineItem(itemIdx, "conjunction_dep_time", e.target.value, isEdit)}
                    className="h-6 text-[10px] font-mono cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] text-slate-500">Arr. Date</Label>
                  <Input
                    type="date"
                    value={item.conjunction_arr_date || ""}
                    onChange={(e) => updateTicketLineItem(itemIdx, "conjunction_arr_date", e.target.value, isEdit)}
                    className="h-6 text-[10px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] text-slate-500">Arr. Time</Label>
                  <Input
                    type="time"
                    step={60}
                    value={item.conjunction_arr_time || ""}
                    onChange={(e) => updateTicketLineItem(itemIdx, "conjunction_arr_time", e.target.value, isEdit)}
                    className="h-6 text-[10px] font-mono cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Cancellation Charges */}
            <div className="p-2 bg-white dark:bg-[#111113] rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block">Cancellation Charges</span>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="flex items-center gap-1">
                  <span className="w-10 text-slate-500 font-medium">Self:</span>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={item.cancellation_charges_self || ""}
                    onChange={(e) => updateTicketLineItem(itemIdx, "cancellation_charges_self", e.target.value, isEdit)}
                    className="h-6 flex-1 text-[10px] font-mono text-right"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-14 text-slate-500 font-medium">Supplier:</span>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={item.cancellation_charges_supplier || ""}
                    onChange={(e) => updateTicketLineItem(itemIdx, "cancellation_charges_supplier", e.target.value, isEdit)}
                    className="h-6 flex-1 text-[10px] font-mono text-right"
                  />
                </div>
              </div>
            </div>

            {/* Customer Remarks */}
            <div className="p-2 bg-white dark:bg-[#111113] rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
              <Label className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                Customer Remarks (Appears on Customer Invoice)
              </Label>
              <Input
                placeholder="e.g. Non-refundable after departure / Baggage 30kg / Passenger note"
                value={item.customer_remarks || ""}
                onChange={(e) => updateTicketLineItem(itemIdx, "customer_remarks", e.target.value, isEdit)}
                className="h-7 text-[11px] bg-white dark:bg-[#161619]"
              />
            </div>
          </div>

          {/* RIGHT BOX (Airline City Tax, IATA / Domestic Taxes, Commercials, Totals) */}
          <div className="lg:col-span-6 space-y-3">
            
            {/* Top: Airline City Tax & City Tax Side-by-Side */}
            <div className="grid grid-cols-2 gap-3">
              {/* Airline City Tax Table (Liability) */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-[#111113]">
                <div className="bg-slate-100 dark:bg-slate-900 px-2 py-1 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                  <span className="font-bold text-[10px] text-slate-700 dark:text-slate-300">Airline Tax</span>
                  <button
                    type="button"
                    onClick={() => addAirlineCityTax(itemIdx, isEdit)}
                    className="text-primary hover:text-primary/80 text-[10px] font-bold flex items-center gap-0.5"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="p-1 space-y-1 max-h-24 overflow-y-auto">
                  {(item.airline_city_taxes || []).map((t, tIdx) => (
                    <div key={tIdx} className="flex gap-1 items-center">
                      <Input
                        placeholder="XT"
                        value={t.code}
                        onChange={(e) => updateAirlineCityTax(itemIdx, tIdx, "code", e.target.value.toUpperCase(), isEdit)}
                        className="h-6 text-[10px] font-mono uppercase w-16"
                      />
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={t.amount}
                        onChange={(e) => updateAirlineCityTax(itemIdx, tIdx, "amount", e.target.value, isEdit)}
                        className="h-6 text-[10px] font-mono flex-1 text-right"
                      />
                      {(item.airline_city_taxes || []).length > 1 && (
                        <button type="button" onClick={() => removeAirlineCityTax(itemIdx, tIdx, isEdit)} className="text-slate-400 hover:text-red-500">
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* City Tax Table (Income / Fee) */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-[#111113]">
                <div className="bg-slate-100 dark:bg-slate-900 px-2 py-1 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                  <span className="font-bold text-[10px] text-slate-700 dark:text-slate-300">City Tax</span>
                  <button
                    type="button"
                    onClick={() => addCityTax(itemIdx, isEdit)}
                    className="text-primary hover:text-primary/80 text-[10px] font-bold flex items-center gap-0.5"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="p-1 space-y-1 max-h-24 overflow-y-auto">
                  {(item.city_taxes || []).map((t, tIdx) => (
                    <div key={tIdx} className="flex gap-1 items-center">
                      <Input
                        placeholder="City Tax"
                        value={t.code}
                        onChange={(e) => updateCityTax(itemIdx, tIdx, "code", e.target.value, isEdit)}
                        className="h-6 text-[10px] font-mono flex-1"
                      />
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={t.amount}
                        onChange={(e) => updateCityTax(itemIdx, tIdx, "amount", e.target.value, isEdit)}
                        className="h-6 text-[10px] font-mono w-20 text-right"
                      />
                      {(item.city_taxes || []).length > 1 && (
                        <button type="button" onClick={() => removeCityTax(itemIdx, tIdx, isEdit)} className="text-slate-400 hover:text-red-500">
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Middle: International Taxes OR Domestic Taxes based on Type Selection */}
            <div className="space-y-3">
              {isDomestic ? (
                /* Domestic Tax Grid matching ERP screenshot */
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-[#111113] shadow-xs">
                  {/* Row 1: Fare & RN Header */}
                  <div className="grid grid-cols-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 divide-x divide-slate-200 dark:divide-slate-800">
                    <div className="flex items-center px-1.5 py-0.5">
                      <span className="w-12 text-[10px] font-bold text-slate-700 dark:text-slate-300">Fare</span>
                      <Input
                        type="number"
                        value={item.base_fare || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "base_fare", e.target.value, isEdit)}
                        className="h-6 text-[11px] font-mono font-bold text-primary bg-white dark:bg-[#161619] text-right"
                      />
                    </div>
                    <div className="flex items-center px-1.5 py-0.5">
                      <span className="w-10 text-[10px] font-semibold text-slate-600 dark:text-slate-400">RN</span>
                      <Input
                        type="number"
                        value={item.tax_rn || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "tax_rn", e.target.value, isEdit)}
                        className="h-6 text-[10px] font-mono bg-white dark:bg-[#161619] text-right"
                      />
                    </div>
                  </div>

                  {/* 4-Col Fixed Domestic Taxes Grid */}
                  <div className="grid grid-cols-4 divide-x divide-y divide-slate-200 dark:divide-slate-800 text-[10px]">
                    {/* Row 1: SP, CED, PK, Empty */}
                    <div className="flex items-center px-1 py-0.5">
                      <span className="w-8 text-[9px] font-bold text-slate-600 dark:text-slate-400">SP</span>
                      <Input
                        type="number"
                        value={item.tax_sp || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "tax_sp", e.target.value, isEdit)}
                        className="h-5 text-[10px] font-mono p-1 text-right"
                      />
                    </div>
                    <div className="flex items-center px-1 py-0.5">
                      <span className="w-8 text-[9px] font-bold text-slate-600 dark:text-slate-400">CED</span>
                      <Input
                        type="number"
                        value={item.tax_ced || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "tax_ced", e.target.value, isEdit)}
                        className="h-5 text-[10px] font-mono p-1 text-right"
                      />
                    </div>
                    <div className="flex items-center px-1 py-0.5">
                      <span className="w-8 text-[9px] font-bold text-slate-600 dark:text-slate-400">PK</span>
                      <Input
                        type="number"
                        value={item.tax_pk || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "tax_pk", e.target.value, isEdit)}
                        className="h-5 text-[10px] font-mono p-1 text-right"
                      />
                    </div>
                    <div className="bg-slate-50/50 dark:bg-slate-900/30"></div>

                    {/* Row 2: YR, PB, YQ, DOF */}
                    <div className="flex items-center px-1 py-0.5">
                      <span className="w-8 text-[9px] font-bold text-slate-600 dark:text-slate-400">YR</span>
                      <Input
                        type="number"
                        value={item.tax_yr || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "tax_yr", e.target.value, isEdit)}
                        className="h-5 text-[10px] font-mono p-1 text-right"
                      />
                    </div>
                    <div className="flex items-center px-1 py-0.5">
                      <span className="w-8 text-[9px] font-bold text-slate-600 dark:text-slate-400">PB</span>
                      <Input
                        type="number"
                        value={item.tax_pb || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "tax_pb", e.target.value, isEdit)}
                        className="h-5 text-[10px] font-mono p-1 text-right"
                      />
                    </div>
                    <div className="flex items-center px-1 py-0.5">
                      <span className="w-8 text-[9px] font-bold text-slate-600 dark:text-slate-400">YQ</span>
                      <Input
                        type="number"
                        value={item.tax_yq || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "tax_yq", e.target.value, isEdit)}
                        className="h-5 text-[10px] font-mono p-1 text-right"
                      />
                    </div>
                    <div className="flex items-center px-1 py-0.5">
                      <span className="w-8 text-[9px] font-bold text-slate-600 dark:text-slate-400">DOF</span>
                      <Input
                        type="number"
                        value={item.tax_dof || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "tax_dof", e.target.value, isEdit)}
                        className="h-5 text-[10px] font-mono p-1 text-right"
                      />
                    </div>

                    {/* Row 3: XZ, YD, YI, Empty */}
                    <div className="flex items-center px-1 py-0.5">
                      <span className="w-8 text-[9px] font-bold text-slate-600 dark:text-slate-400">XZ</span>
                      <Input
                        type="number"
                        value={item.tax_xz || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "tax_xz", e.target.value, isEdit)}
                        className="h-5 text-[10px] font-mono p-1 text-right"
                      />
                    </div>
                    <div className="flex items-center px-1 py-0.5">
                      <span className="w-8 text-[9px] font-bold text-slate-600 dark:text-slate-400">YD</span>
                      <Input
                        type="number"
                        value={item.tax_yd || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "tax_yd", e.target.value, isEdit)}
                        className="h-5 text-[10px] font-mono p-1 text-right"
                      />
                    </div>
                    <div className="flex items-center px-1 py-0.5">
                      <span className="w-8 text-[9px] font-bold text-slate-600 dark:text-slate-400">YI</span>
                      <Input
                        type="number"
                        value={item.tax_yi || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "tax_yi", e.target.value, isEdit)}
                        className="h-5 text-[10px] font-mono p-1 text-right"
                      />
                    </div>
                    <div className="bg-slate-50/50 dark:bg-slate-900/30"></div>
                  </div>
                </div>
              ) : (
                /* International Fixed Taxes (Fare, RN, SP, RG, PK, YR, YQ, DOF, XZ, YD, YI) */
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-[#111113] shadow-xs">
                  {/* Row 1: Fare & RN Header */}
                  <div className="grid grid-cols-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 divide-x divide-slate-200 dark:divide-slate-800">
                    <div className="flex items-center px-1.5 py-0.5">
                      <span className="w-12 text-[10px] font-bold text-slate-700 dark:text-slate-300">Fare</span>
                      <Input
                        type="number"
                        value={item.base_fare || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "base_fare", e.target.value, isEdit)}
                        className="h-6 text-[11px] font-mono font-bold text-primary bg-white dark:bg-[#161619] text-right"
                      />
                    </div>
                    <div className="flex items-center px-1.5 py-0.5">
                      <span className="w-10 text-[10px] font-semibold text-slate-600 dark:text-slate-400">RN</span>
                      <Input
                        type="number"
                        value={item.tax_rn || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "tax_rn", e.target.value, isEdit)}
                        className="h-6 text-[10px] font-mono bg-white dark:bg-[#161619] text-right"
                      />
                    </div>
                  </div>

                  {/* 4-Col Fixed Taxes Grid */}
                  <div className="grid grid-cols-4 divide-x divide-y divide-slate-200 dark:divide-slate-800 text-[10px]">
                    {/* Row 1: SP, RG, PK, YR */}
                    <div className="flex items-center px-1 py-0.5">
                      <span className="w-8 text-[9px] font-bold text-slate-600 dark:text-slate-400">SP</span>
                      <Input
                        type="number"
                        value={item.tax_sp || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "tax_sp", e.target.value, isEdit)}
                        className="h-5 text-[10px] font-mono p-1 text-right"
                      />
                    </div>
                    <div className="flex items-center px-1 py-0.5">
                      <span className="w-8 text-[9px] font-bold text-slate-600 dark:text-slate-400">RG</span>
                      <Input
                        type="number"
                        value={item.tax_rg || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "tax_rg", e.target.value, isEdit)}
                        className="h-5 text-[10px] font-mono p-1 text-right"
                      />
                    </div>
                    <div className="flex items-center px-1 py-0.5">
                      <span className="w-8 text-[9px] font-bold text-slate-600 dark:text-slate-400">PK</span>
                      <Input
                        type="number"
                        value={item.tax_pk || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "tax_pk", e.target.value, isEdit)}
                        className="h-5 text-[10px] font-mono p-1 text-right"
                      />
                    </div>
                    <div className="flex items-center px-1 py-0.5">
                      <span className="w-8 text-[9px] font-bold text-slate-600 dark:text-slate-400">YR</span>
                      <Input
                        type="number"
                        value={item.tax_yr || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "tax_yr", e.target.value, isEdit)}
                        className="h-5 text-[10px] font-mono p-1 text-right"
                      />
                    </div>

                    {/* Row 2: YQ, DOF, XZ, YD */}
                    <div className="flex items-center px-1 py-0.5">
                      <span className="w-8 text-[9px] font-bold text-slate-600 dark:text-slate-400">YQ</span>
                      <Input
                        type="number"
                        value={item.tax_yq || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "tax_yq", e.target.value, isEdit)}
                        className="h-5 text-[10px] font-mono p-1 text-right"
                      />
                    </div>
                    <div className="flex items-center px-1 py-0.5">
                      <span className="w-8 text-[9px] font-bold text-slate-600 dark:text-slate-400">DOF</span>
                      <Input
                        type="number"
                        value={item.tax_dof || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "tax_dof", e.target.value, isEdit)}
                        className="h-5 text-[10px] font-mono p-1 text-right"
                      />
                    </div>
                    <div className="flex items-center px-1 py-0.5">
                      <span className="w-8 text-[9px] font-bold text-slate-600 dark:text-slate-400">XZ</span>
                      <Input
                        type="number"
                        value={item.tax_xz || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "tax_xz", e.target.value, isEdit)}
                        className="h-5 text-[10px] font-mono p-1 text-right"
                      />
                    </div>
                    <div className="flex items-center px-1 py-0.5">
                      <span className="w-8 text-[9px] font-bold text-slate-600 dark:text-slate-400">YD</span>
                      <Input
                        type="number"
                        value={item.tax_yd || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "tax_yd", e.target.value, isEdit)}
                        className="h-5 text-[10px] font-mono p-1 text-right"
                      />
                    </div>

                    {/* Row 3: YI, Empty, Empty, Empty */}
                    <div className="flex items-center px-1 py-0.5">
                      <span className="w-8 text-[9px] font-bold text-slate-600 dark:text-slate-400">YI</span>
                      <Input
                        type="number"
                        value={item.tax_yi || ""}
                        onChange={(e) => updateTicketLineItem(itemIdx, "tax_yi", e.target.value, isEdit)}
                        className="h-5 text-[10px] font-mono p-1 text-right"
                      />
                    </div>
                    <div className="bg-slate-50/50 dark:bg-slate-900/30"></div>
                    <div className="bg-slate-50/50 dark:bg-slate-900/30"></div>
                    <div className="bg-slate-50/50 dark:bg-slate-900/30"></div>
                  </div>
                </div>
              )}

              {/* Commercials, WHT & Deductions Table matching ERP Screenshot */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-[#111113] shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px] border-collapse">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                        <th className="py-1 px-1.5 text-left border-r border-slate-200 dark:border-slate-800 w-12">Field</th>
                        <th className="py-1 px-1 text-center border-r border-slate-200 dark:border-slate-800 w-14">%</th>
                        <th className="py-1 px-1.5 text-right border-r border-slate-200 dark:border-slate-800">Amount</th>
                        <th className="py-1 px-1.5 text-left border-r border-slate-200 dark:border-slate-800 w-12">Field</th>
                        <th className="py-1 px-1 text-center border-r border-slate-200 dark:border-slate-800 w-14">%</th>
                        <th className="py-1 px-1.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {/* Row 1: COM & WHT */}
                      <tr className="divide-x divide-slate-200 dark:divide-slate-800">
                        <td className="py-0.5 px-1.5 font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40">COM</td>
                        <td className="p-0.5">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={item.commission_percent || ""}
                            onChange={(e) => updateTicketLineItem(itemIdx, "commission_percent", e.target.value, isEdit)}
                            className="h-5 text-[10px] font-mono text-center p-0.5"
                          />
                        </td>
                        <td className="p-0.5">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={item.commission_amount || ""}
                            onChange={(e) => updateTicketLineItem(itemIdx, "commission_amount", e.target.value, isEdit)}
                            className="h-5 text-[10px] font-mono text-right p-0.5"
                          />
                        </td>
                        <td className="py-0.5 px-1.5 font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40">WHT</td>
                        <td className="p-0.5">
                          <Input
                            type="number"
                            placeholder="24.00"
                            value={item.wht_percent || ""}
                            onChange={(e) => updateTicketLineItem(itemIdx, "wht_percent", e.target.value, isEdit)}
                            className="h-5 text-[10px] font-mono text-center p-0.5"
                          />
                        </td>
                        <td className="p-0.5">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={item.wht_amount || ""}
                            onChange={(e) => updateTicketLineItem(itemIdx, "wht_amount", e.target.value, isEdit)}
                            className="h-5 text-[10px] font-mono text-right p-0.5"
                          />
                        </td>
                      </tr>

                      {/* Row 2: DIS & DIS2 */}
                      <tr className="divide-x divide-slate-200 dark:divide-slate-800">
                        <td className="py-0.5 px-1.5 font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40">DIS</td>
                        <td className="p-0.5">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={item.discount_percent || ""}
                            onChange={(e) => updateTicketLineItem(itemIdx, "discount_percent", e.target.value, isEdit)}
                            className="h-5 text-[10px] font-mono text-center p-0.5"
                          />
                        </td>
                        <td className="p-0.5">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={item.discount_amount || ""}
                            onChange={(e) => updateTicketLineItem(itemIdx, "discount_amount", e.target.value, isEdit)}
                            className="h-5 text-[10px] font-mono text-right p-0.5"
                          />
                        </td>
                        <td className="py-0.5 px-1.5 font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40">DIS2</td>
                        <td className="p-0.5">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={item.discount2_percent || ""}
                            onChange={(e) => updateTicketLineItem(itemIdx, "discount2_percent", e.target.value, isEdit)}
                            className="h-5 text-[10px] font-mono text-center p-0.5"
                          />
                        </td>
                        <td className="p-0.5">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={item.discount2_amount || ""}
                            onChange={(e) => updateTicketLineItem(itemIdx, "discount2_amount", e.target.value, isEdit)}
                            className="h-5 text-[10px] font-mono text-right p-0.5"
                          />
                        </td>
                      </tr>

                      {/* Row 3: PSF/P & PSF */}
                      <tr className="divide-x divide-slate-200 dark:divide-slate-800">
                        <td className="py-0.5 px-1.5 font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40">PSF/P</td>
                        <td className="p-0.5">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={item.psf_p_percent || ""}
                            onChange={(e) => updateTicketLineItem(itemIdx, "psf_p_percent", e.target.value, isEdit)}
                            className="h-5 text-[10px] font-mono text-center p-0.5"
                          />
                        </td>
                        <td className="p-0.5">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={item.psf_p_amount || ""}
                            onChange={(e) => updateTicketLineItem(itemIdx, "psf_p_amount", e.target.value, isEdit)}
                            className="h-5 text-[10px] font-mono text-right p-0.5"
                          />
                        </td>
                        <td className="py-0.5 px-1.5 font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40">PSF</td>
                        <td className="p-0.5">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={item.psf_percent || ""}
                            onChange={(e) => updateTicketLineItem(itemIdx, "psf_percent", e.target.value, isEdit)}
                            className="h-5 text-[10px] font-mono text-center p-0.5"
                          />
                        </td>
                        <td className="p-0.5">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={item.psf_amount || ""}
                            onChange={(e) => updateTicketLineItem(itemIdx, "psf_amount", e.target.value, isEdit)}
                            className="h-5 text-[10px] font-mono text-right p-0.5"
                          />
                        </td>
                      </tr>

                      {/* Row 4: GST & SEG */}
                      <tr className="divide-x divide-slate-200 dark:divide-slate-800">
                        <td className="py-0.5 px-1.5 font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40">GST</td>
                        <td className="p-0.5">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={item.gst_percent || ""}
                            onChange={(e) => updateTicketLineItem(itemIdx, "gst_percent", e.target.value, isEdit)}
                            className="h-5 text-[10px] font-mono text-center p-0.5"
                          />
                        </td>
                        <td className="p-0.5">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={item.gst_amount || ""}
                            onChange={(e) => updateTicketLineItem(itemIdx, "gst_amount", e.target.value, isEdit)}
                            className="h-5 text-[10px] font-mono text-right p-0.5"
                          />
                        </td>
                        <td className="py-0.5 px-1.5 font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40">SEG</td>
                        <td className="p-0.5">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={item.seg_percent || ""}
                            onChange={(e) => updateTicketLineItem(itemIdx, "seg_percent", e.target.value, isEdit)}
                            className="h-5 text-[10px] font-mono text-center p-0.5"
                          />
                        </td>
                        <td className="p-0.5">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={item.seg_amount || ""}
                            onChange={(e) => updateTicketLineItem(itemIdx, "seg_amount", e.target.value, isEdit)}
                            className="h-5 text-[10px] font-mono text-right p-0.5"
                          />
                        </td>
                      </tr>

                      {/* Row 5: WHT_C & Empty */}
                      <tr className="divide-x divide-slate-200 dark:divide-slate-800">
                        <td className="py-0.5 px-1.5 font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40">WHT_C</td>
                        <td className="p-0.5">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={item.wht_c_percent || ""}
                            onChange={(e) => updateTicketLineItem(itemIdx, "wht_c_percent", e.target.value, isEdit)}
                            className="h-5 text-[10px] font-mono text-center p-0.5"
                          />
                        </td>
                        <td className="p-0.5">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={item.wht_c_amount || ""}
                            onChange={(e) => updateTicketLineItem(itemIdx, "wht_c_amount", e.target.value, isEdit)}
                            className="h-5 text-[10px] font-mono text-right p-0.5"
                          />
                        </td>
                        <td className="bg-slate-50/50 dark:bg-slate-900/30"></td>
                        <td className="bg-slate-50/50 dark:bg-slate-900/30"></td>
                        <td className="bg-slate-50/50 dark:bg-slate-900/30"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Auto Update Checkbox */}
                <div className="p-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.auto_update !== false}
                      onChange={(e) => updateTicketLineItem(itemIdx, "auto_update", e.target.checked, isEdit)}
                      className="rounded border-slate-300 text-primary h-3.5 w-3.5"
                    />
                    Auto Update
                  </label>
                </div>
              </div>
            </div>

            {/* Totals Summary */}
            <div className="p-3 bg-slate-900 text-white rounded-lg font-mono text-[11px] space-y-1 shadow">
              <div className="grid grid-cols-2 gap-x-4 border-b border-slate-800 pb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                <span>Receivables &amp; Gross</span>
                <span className="text-right">Payables &amp; Net</span>
              </div>

              <div className="grid grid-cols-2 gap-x-4 pt-1">
                <div className="flex justify-between text-slate-300">
                  <span>Customer Gross:</span>
                  <span className="font-bold">{item.customer_gross?.toLocaleString() || "0.00"}</span>
                </div>
                <div className="flex justify-between text-emerald-400 font-bold">
                  <span>Customer Net:</span>
                  <span>{item.customer_net?.toLocaleString() || "0.00"}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4">
                <div className="flex justify-between text-slate-400 text-[10px]">
                  <span>Invoice Rec. Gross:</span>
                  <span>{item.customer_gross?.toLocaleString() || "0.00"}</span>
                </div>
                <div className="flex justify-between text-slate-300 text-[10px]">
                  <span>Invoice Rec. Net:</span>
                  <span>{item.customer_net?.toLocaleString() || "0.00"}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 border-t border-slate-800/80 pt-1">
                <div className="flex justify-between text-slate-300">
                  <span>Supplier Gross:</span>
                  <span className="font-bold">{item.supplier_gross?.toLocaleString() || "0.00"}</span>
                </div>
                <div className="flex justify-between text-amber-400 font-bold">
                  <span>Supplier Net:</span>
                  <span>{item.supplier_net?.toLocaleString() || "0.00"}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4">
                <div className="flex justify-between text-slate-400 text-[10px]">
                  <span>Invoice Pay. Gross:</span>
                  <span>{item.supplier_gross?.toLocaleString() || "0.00"}</span>
                </div>
                <div className="flex justify-between text-slate-300 text-[10px]">
                  <span>Invoice Pay. Net:</span>
                  <span>{item.supplier_net?.toLocaleString() || "0.00"}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 border-t border-slate-800 pt-1">
                <div className="flex justify-between text-slate-400 text-[10px]">
                  <span>Supplier Gross W/o WHT:</span>
                  <span>{item.supplier_gross_wo_wht?.toLocaleString() || item.supplier_gross?.toLocaleString() || "0.00"}</span>
                </div>
                <div className="flex justify-between text-right">
                  <span className="text-slate-400 uppercase font-bold text-[10px]">Agency Profit:</span>
                  <span className="font-bold text-blue-400 text-[12px]">
                    + {item.agency_margin?.toLocaleString() || "0.00"}
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  };

  const hasActiveFilters = searchQuery || dateRangeFilter !== "all" || paymentStatusFilter !== "all" || statusFilter !== "all" || customerFilter !== "all";
  const isFormView = showNew || !!editInvoiceId;

  return (
    <div>
      {/* City & Airport Autocomplete Datalist */}
      <datalist id="city-airport-options">
        {CITY_AIRPORT_CODES.map((c) => (
          <option key={c.code} value={c.code}>
            {`${c.code} - ${c.name} (${c.country})`}
          </option>
        ))}
      </datalist>

      {isFormView ? (
        /* Create / Edit Invoice View */
        <div className="space-y-4">
          {/* Top Action & Navigation Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white dark:bg-[#111113] border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowNew(false);
                  setEditInvoiceId(null);
                }}
                className="h-8 gap-1.5 text-xs font-semibold cursor-pointer border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Invoices
              </Button>
              <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 hidden sm:block" />
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                {editInvoiceId ? (
                  <>
                    <Pencil className="h-4 w-4 text-primary" />
                    Editing Invoice #{invoices.find((i) => i._id === editInvoiceId)?.invoice_number || "..."}
                    {(() => {
                      const curInv = invoices.find((i) => i._id === editInvoiceId);
                      const st = curInv?.status || editDocStatus || "Draft";
                      return (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ml-1 ${statusStyles[st] || ""}`}>
                          {st}
                        </span>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 text-primary" />
                    New Ticket Sales Invoice
                  </>
                )}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161619]"
                onClick={() => {
                  setEditInvoiceId(null);
                  setShowNew(true);
                  setLineItems([createDefaultTicketItem()]);
                  setActiveTicketTab(0);
                }}
              >
                <Plus className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" /> New Invoice
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161619]"
                onClick={() => {
                  if (editInvoiceId) {
                    setLineItems(JSON.parse(JSON.stringify(editLineItems)));
                    setNewCustomerId(editCustomerId);
                    setNewPrintName(editPrintName);
                    setNewSpoId(editSpoId);
                    setNewVisitType(editVisitType);
                    setNewPaymentMode(editPaymentMode);
                    setNewDocStatus("Draft");
                    setNewInternalRemarks(editInternalRemarks);
                    setEditInvoiceId(null);
                    setShowNew(true);
                  } else {
                    const copyItems = JSON.parse(JSON.stringify(lineItems));
                    setLineItems((prev) => [...prev, ...copyItems]);
                  }
                }}
              >
                <Copy className="h-3.5 w-3.5 text-blue-600" /> Copy Full Inv
              </Button>

              {/* Status-specific action buttons for Edit mode */}
              {editInvoiceId && (() => {
                const curInv = invoices.find((i) => i._id === editInvoiceId);
                const st = curInv?.status || editDocStatus || "Draft";
                return (
                  <>
                    {st === "Draft" && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                          onClick={() => postInvoice(editInvoiceId)}
                        >
                          <Send className="h-3.5 w-3.5" /> Post Invoice
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 border-slate-300 dark:border-slate-700"
                          onClick={() => {
                            setDeleteInvoiceId(editInvoiceId);
                            setEditInvoiceId(null);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </Button>
                      </>
                    )}

                    {st === "Posted" && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10 border-amber-300 dark:border-amber-800"
                          onClick={() => unpostInvoice(editInvoiceId)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Unpost Invoice
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 border-slate-300 dark:border-slate-700"
                          onClick={() => setVoidDialog(editInvoiceId)}
                        >
                          <Ban className="h-3.5 w-3.5" /> Void
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1.5 border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161619]"
                          onClick={() => setCreditDialog(editInvoiceId)}
                        >
                          <CreditCard className="h-3.5 w-3.5" /> Credit Note
                        </Button>
                      </>
                    )}

                    {st === "Voided" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 border-slate-300 dark:border-slate-700"
                        onClick={() => {
                          setDeleteInvoiceId(editInvoiceId);
                          setEditInvoiceId(null);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    )}

                    {isManager && curInv && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1.5 border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161619]"
                        onClick={() => loadAuditLogs(curInv)}
                      >
                        <History className="h-3.5 w-3.5" /> Logs
                      </Button>
                    )}
                  </>
                );
              })()}

              {!editInvoiceId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30 hover:bg-emerald-100"
                  onClick={() => {
                    setNewDocStatus("Confirmed");
                    createInvoice();
                  }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Post
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161619]"
                onClick={async () => {
                  const win = window.open("", "_blank");
                  if (editInvoiceId) {
                    const ok = await saveEditInvoice();
                    if (ok) {
                      if (win) win.location.href = `/dashboard/invoices/${editInvoiceId}/print`;
                    } else {
                      if (win) win.close();
                    }
                  } else {
                    const createdId = await createInvoice();
                    if (createdId) {
                      if (win) win.location.href = `/dashboard/invoices/${createdId}/print`;
                    } else {
                      if (win) win.close();
                    }
                  }
                }}
              >
                <Printer className="h-3.5 w-3.5 text-purple-600" /> Print
              </Button>

              <Button
                type="button"
                size="sm"
                className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                onClick={() => {
                  if (editInvoiceId) {
                    saveEditInvoice();
                  } else {
                    createInvoice();
                  }
                }}
                disabled={editInvoiceId ? isSavingEdit : isCreating}
              >
                {(editInvoiceId ? isSavingEdit : isCreating) ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {(editInvoiceId ? isSavingEdit : isCreating) ? "Saving..." : "Save Invoice"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowNew(false);
                  setEditInvoiceId(null);
                }}
                className="h-8 w-8 p-0 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Inline Create Invoice Form Card */}
          {showNew && (
        <Card className="mb-6 border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113] shadow-md">
          <CardHeader className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {defaultType === "Ticket" ? "Ticket Booking & Sale Invoice" : "Create New Invoice"}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowNew(false)} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-5">
            <div className="space-y-3.5 pt-1">
              {/* Top Invoice Header — Single Row: all fields in one line */}
              <div className="p-3 bg-slate-100/70 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 text-[12px] mb-4">
                <div className="grid gap-2" style={{ gridTemplateColumns: "115px 115px 1fr 1fr 120px 105px 100px 95px 1fr" }}>
                  {/* Inv. Date */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Inv. Date *</Label>
                    <Input type="date" value={newInvDate} onChange={(e) => setNewInvDate(e.target.value)} className="h-8 text-[11px] bg-white dark:bg-[#161619] px-1.5" />
                  </div>
                  {/* Adj. Date */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Adj. Date</Label>
                    <Input type="date" value={newAdjDate} onChange={(e) => setNewAdjDate(e.target.value)} className="h-8 text-[11px] bg-white dark:bg-[#161619] px-1.5" />
                  </div>
                  {/* Customer */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Customer *</Label>
                    <Input
                      type="text"
                      placeholder="Type or select customer..."
                      value={getCustomerName(newCustomerId)}
                      onChange={(e) => {
                        const val = e.target.value;
                        const matched = customers.find(
                          (c) =>
                            (c && c.name && String(c.name).toLowerCase() === val.trim().toLowerCase()) ||
                            (c && c.code && String(c.code).toLowerCase() === val.trim().toLowerCase()) ||
                            (c && c._id === val)
                        );
                        if (matched) {
                          setNewCustomerId(matched._id);
                          setNewPrintName(matched.name);
                        } else {
                          setNewCustomerId(val);
                          setNewPrintName(val);
                        }
                      }}
                      className="h-8 text-[11px] bg-white dark:bg-[#161619]"
                      list="new-customers-list"
                    />
                    <datalist id="new-customers-list">
                      {customers.map((c) => (
                        <option key={c._id} value={c.name}>
                          {c.code ? `${c.code} - ${c.name}` : c.name}
                        </option>
                      ))}
                    </datalist>
                  </div>
                  {/* Print Name */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Print Name *</Label>
                    <Input value={newPrintName} onChange={(e) => setNewPrintName(e.target.value)} placeholder="Print Name" className="h-8 text-[11px] bg-white dark:bg-[#161619]" />
                  </div>
                  {/* SPO / Agent */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">SPO / Agent</Label>
                    <Select value={newSpoId} onValueChange={(v) => setNewSpoId(v || "")}>
                      <SelectTrigger className="h-8 text-[11px] bg-white dark:bg-[#161619]">
                        <SelectValue placeholder="Agent">
                          {(val) => getAgentName(val)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>{staffUsers.map((u) => <SelectItem key={u._id} value={u._id}>{u.name} ({u.role})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {/* Visit Type */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Visit Type *</Label>
                    <Select value={newVisitType} onValueChange={(v) => setNewVisitType(v || "Visitor")}>
                      <SelectTrigger className="h-8 text-[11px] bg-white dark:bg-[#161619]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Visitor">Visitor</SelectItem>
                        <SelectItem value="Corporate">Corporate</SelectItem>
                        <SelectItem value="Government">Government</SelectItem>
                        <SelectItem value="Walk-in">Walk-in</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Pay. Mode */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Pay. Mode *</Label>
                    <Select value={newPaymentMode} onValueChange={(v) => setNewPaymentMode(v || "CR")}>
                      <SelectTrigger className="h-8 text-[11px] bg-white dark:bg-[#161619]">
                        <SelectValue>{(val) => val === "CR" ? "CR" : val || "CR"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CR">CR (Credit)</SelectItem>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                        <SelectItem value="Cheque">Cheque</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Status */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Status *</Label>
                    <Select value={newDocStatus} onValueChange={(v) => setNewDocStatus(v || "Draft")}>
                      <SelectTrigger className="h-8 text-[11px] bg-white dark:bg-[#161619]">
                        <SelectValue>{(val) => val === "Draft" ? "Draft (D)" : "Conf (C)"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Draft">Draft (D)</SelectItem>
                        <SelectItem value="Confirmed">Confirmed (C)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Internal Remarks */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Internal Remarks</Label>
                    <Input
                      placeholder="Internal notes..."
                      value={newInternalRemarks}
                      onChange={(e) => setNewInternalRemarks(e.target.value)}
                      className="h-8 text-[11px] bg-white dark:bg-[#161619]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Multi-Ticket Vertical Sidebar & Form (Create) */}
            {lineItems[0]?.service_type === "Ticket" ? (
              <div className="space-y-3">
                <div className="flex flex-col md:flex-row gap-3 items-start">
                  {/* Left Sidebar List of Tickets */}
                  <div className={`flex-shrink-0 bg-slate-50 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 transition-all duration-300 ${
                    isTicketSidebarCollapsed ? "w-full md:w-14" : "w-full md:w-52"
                  }`}>
                    {!isTicketSidebarCollapsed ? (
                      <div className="flex items-center justify-between px-1 py-1 border-b border-slate-200 dark:border-slate-800">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 truncate">
                          <Plane className="h-3.5 w-3.5 text-primary flex-shrink-0" /> Tickets ({lineItems.length})
                        </span>
                        <div className="flex items-center gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-slate-200 dark:hover:bg-slate-800"
                            title="Add Ticket"
                            onClick={() => {
                              const newTicket = createDefaultTicketItem();
                              setLineItems((prev) => [...prev, newTicket]);
                              setActiveTicketTab(lineItems.length);
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            title="Collapse sidebar"
                            onClick={() => setIsTicketSidebarCollapsed(true)}
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1 pb-2 border-b border-slate-200 dark:border-slate-800">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          title="Expand sidebar"
                          onClick={() => setIsTicketSidebarCollapsed(false)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 hover:bg-primary/10 text-primary"
                          title="Add Ticket"
                          onClick={() => {
                            const newTicket = createDefaultTicketItem();
                            setLineItems((prev) => [...prev, newTicket]);
                            setActiveTicketTab(lineItems.length);
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    )}

                    <div className="space-y-1.5 max-h-[550px] overflow-y-auto pr-0.5">
                      {lineItems.map((li, idx) => {
                        const isSelected = activeTicketTab === idx;
                        const paxName = li.pax_name || `Ticket ${idx + 1}`;
                        const tktNum = li.ticket_number || "";

                        if (isTicketSidebarCollapsed) {
                          return (
                            <div
                              key={idx}
                              onClick={() => setActiveTicketTab(idx)}
                              title={`${paxName}${tktNum ? ` (${tktNum})` : ""}`}
                              className={`h-9 w-9 rounded-xl flex items-center justify-center text-xs font-extrabold cursor-pointer transition-all mx-auto border ${
                                isSelected
                                  ? "bg-blue-600 text-white border-blue-500 shadow-md ring-2 ring-blue-500/40 dark:bg-blue-600 dark:text-white dark:border-blue-400"
                                  : "bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                              }`}
                            >
                              {idx + 1}
                            </div>
                          );
                        }

                        return (
                          <div
                            key={idx}
                            onClick={() => setActiveTicketTab(idx)}
                            className={`group relative flex items-center justify-between p-2.5 rounded-xl text-xs cursor-pointer transition-all border ${
                              isSelected
                                ? "bg-blue-600 text-white border-blue-600 dark:bg-blue-600 dark:text-white dark:border-blue-500 shadow-md font-semibold"
                                : "bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700/70 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700/80"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                                isSelected ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                              }`}>
                                {idx + 1}
                              </span>
                              <div className="truncate min-w-0">
                                <p className={`truncate text-[11.5px] leading-tight font-bold ${
                                  isSelected ? "text-white" : "text-slate-800 dark:text-slate-200"
                                }`}>
                                  {paxName}
                                </p>
                                {tktNum && (
                                  <p className={`text-[9.5px] truncate font-mono mt-0.5 ${
                                    isSelected ? "text-white/80" : "text-slate-400 dark:text-slate-400"
                                  }`}>
                                    {tktNum}
                                  </p>
                                )}
                              </div>
                            </div>

                            {lineItems.length > 1 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const updated = lineItems.filter((_, i) => i !== idx);
                                  setLineItems(updated);
                                  if (activeTicketTab >= updated.length) setActiveTicketTab(Math.max(0, updated.length - 1));
                                }}
                                className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                                  isSelected ? "hover:bg-white/20 text-white" : "hover:bg-red-100 dark:hover:bg-red-950/50 text-slate-400 hover:text-red-600"
                                }`}
                                title="Delete ticket"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {!isTicketSidebarCollapsed && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full h-8 text-xs gap-1.5 border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161619] hover:bg-primary/5 hover:border-primary"
                        onClick={() => {
                          const newTicket = createDefaultTicketItem();
                          setLineItems((prev) => [...prev, newTicket]);
                          setActiveTicketTab(lineItems.length);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Ticket
                      </Button>
                    )}
                  </div>

                  {/* Right Active Ticket Form */}
                  <div className="flex-1 min-w-0 w-full">
                    {renderTicketForm(lineItems[activeTicketTab] || lineItems[0], activeTicketTab, false)}
                  </div>
                </div>

                {/* Multi-Ticket Grand Total Summary */}
                {lineItems.length > 1 && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs font-semibold">
                    <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                      <Layers className="h-4 w-4" />
                      <span>Combined Invoice: <strong>{lineItems.length} Passenger Tickets</strong></span>
                    </div>
                    <div className="flex items-center gap-4 font-mono">
                      <span>Grand Total Due: <strong className="text-primary text-sm">PKR {lineItems.reduce((sum, item) => sum + (item.customer_net || 0), 0).toLocaleString()}</strong></span>
                      <span>Total Agency Margin: <strong className="text-blue-600 dark:text-blue-400">PKR {lineItems.reduce((sum, item) => sum + (item.agency_margin || 0), 0).toLocaleString()}</strong></span>
                    </div>
                  </div>
                )}
              </div>
              ) : (
                /* Non-ticket Line Items */
                lineItems.map((li, idx) => (
                  <div key={idx} className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 space-y-3 bg-gray-50/50">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Description"
                        value={li.description}
                        onChange={(e) => {
                          const arr = [...lineItems];
                          arr[idx].description = e.target.value;
                          setLineItems(arr);
                        }}
                        className="flex-1 h-9 text-[13px]"
                      />
                      <Input
                        placeholder="Amount"
                        type="number"
                        value={li.amount}
                        onChange={(e) => {
                          const arr = [...lineItems];
                          arr[idx].amount = e.target.value;
                          setLineItems(arr);
                        }}
                        className="w-32 h-9 text-[13px] font-mono"
                      />
                    </div>
                  </div>
                ))
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
                <Button onClick={createInvoice} disabled={!newCustomerId || lineItems.length === 0 || isCreating} className="gap-2">
                  {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  {isCreating ? "Saving..." : "Save Invoice"}
                </Button>
              </div>
          </CardContent>
        </Card>
      )}

          {/* Inline Edit Invoice Form Card */}
          {!!editInvoiceId && (() => {
            const currentEditInv = invoices.find((i) => i._id === editInvoiceId);

            return (
              <Card className="mb-6 border-blue-300 dark:border-blue-800/80 bg-white dark:bg-[#111113] shadow-lg">
                <CardContent className="p-5">
              {editLoading ? (
                <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : (
                <div className="space-y-3.5 pt-1">
                  {/* Top Header Grid for Edit Modal — Single Row */}
                  <div className="p-3 bg-slate-100/70 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 text-[12px] mb-4">
                    <div className="grid gap-2" style={{ gridTemplateColumns: "115px 115px 1fr 1fr 120px 105px 100px 95px 1fr" }}>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">Inv. Date</Label>
                        <Input
                          readOnly
                          value={currentEditInv?.created_at ? new Date(currentEditInv.created_at).toISOString().split("T")[0] : editAdjDate}
                          className="h-8 text-[11px] bg-slate-100 dark:bg-[#161619] px-1.5 font-mono text-slate-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">Adj. Date</Label>
                        <Input type="date" value={editAdjDate} onChange={(e) => setEditAdjDate(e.target.value)} className="h-8 text-[11px] bg-white dark:bg-[#161619] px-1.5" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">Customer *</Label>
                        <Input
                          type="text"
                          placeholder="Type or select customer..."
                          value={getCustomerName(editCustomerId)}
                          onChange={(e) => {
                            const val = e.target.value;
                            const matched = customers.find(
                              (c) =>
                                (c && c.name && String(c.name).toLowerCase() === val.trim().toLowerCase()) ||
                                (c && c.code && String(c.code).toLowerCase() === val.trim().toLowerCase()) ||
                                (c && c._id === val)
                            );
                            if (matched) {
                              setEditCustomerId(matched._id);
                              setEditPrintName(matched.name);
                            } else {
                              setEditCustomerId(val);
                              setEditPrintName(val);
                            }
                          }}
                          className="h-8 text-[11px] bg-white dark:bg-[#161619]"
                          list="edit-customers-list"
                        />
                        <datalist id="edit-customers-list">
                          {customers.map((c) => (
                            <option key={c._id} value={c.name}>
                              {c.code ? `${c.code} - ${c.name}` : c.name}
                            </option>
                          ))}
                        </datalist>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">Print Name *</Label>
                        <Input value={editPrintName} onChange={(e) => setEditPrintName(e.target.value)} className="h-8 text-[11px] bg-white dark:bg-[#161619]" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">SPO / Agent</Label>
                        <Select value={editSpoId} onValueChange={(v) => setEditSpoId(v || "")}>
                          <SelectTrigger className="h-8 text-[11px] bg-white dark:bg-[#161619]">
                            <SelectValue placeholder="Agent">
                              {(val) => getAgentName(val)}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>{staffUsers.map((u) => <SelectItem key={u._id} value={u._id}>{u.name} ({u.role})</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">Visit Type *</Label>
                        <Select value={editVisitType} onValueChange={(v) => setEditVisitType(v || "Visitor")}>
                          <SelectTrigger className="h-8 text-[11px] bg-white dark:bg-[#161619]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Visitor">Visitor</SelectItem>
                            <SelectItem value="Corporate">Corporate</SelectItem>
                            <SelectItem value="Government">Government</SelectItem>
                            <SelectItem value="Walk-in">Walk-in</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">Pay. Mode *</Label>
                        <Select value={editPaymentMode} onValueChange={(v) => setEditPaymentMode(v || "CR")}>
                          <SelectTrigger className="h-8 text-[11px] bg-white dark:bg-[#161619]">
                            <SelectValue>{(val) => val === "CR" ? "CR" : val || "CR"}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CR">CR (Credit)</SelectItem>
                            <SelectItem value="Cash">Cash</SelectItem>
                            <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                            <SelectItem value="Cheque">Cheque</SelectItem>
                            <SelectItem value="Card">Card</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">Status *</Label>
                        <Select value={editDocStatus} onValueChange={(v) => setEditDocStatus(v || "Draft")}>
                          <SelectTrigger className="h-8 text-[11px] bg-white dark:bg-[#161619]">
                            <SelectValue>{(val) => val === "Draft" ? "Draft (D)" : "Conf (C)"}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Draft">Draft (D)</SelectItem>
                            <SelectItem value="Confirmed">Confirmed (C)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">Internal Remarks</Label>
                        <Input
                          placeholder="Internal notes..."
                          value={editInternalRemarks}
                          onChange={(e) => setEditInternalRemarks(e.target.value)}
                          className="h-8 text-[11px] bg-white dark:bg-[#161619]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Multi-Ticket Vertical Sidebar & Form (Edit) */}
                  {editLineItems[0]?.service_type === "Ticket" ? (
                    <div className="space-y-3">
                      <div className="flex flex-col md:flex-row gap-3 items-start">
                        {/* Left Sidebar List of Tickets */}
                        <div className={`flex-shrink-0 bg-slate-50 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 transition-all duration-300 ${
                          isEditTicketSidebarCollapsed ? "w-full md:w-14" : "w-full md:w-52"
                        }`}>
                    {!isEditTicketSidebarCollapsed ? (
                      <div className="flex items-center justify-between px-1 py-1 border-b border-slate-200 dark:border-slate-800">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 truncate">
                          <Plane className="h-3.5 w-3.5 text-primary flex-shrink-0" /> Tickets ({editLineItems.length})
                        </span>
                        <div className="flex items-center gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-slate-200 dark:hover:bg-slate-800"
                            title="Add Ticket"
                            onClick={() => {
                              const newTicket = createDefaultTicketItem();
                              setEditLineItems((prev) => [...prev, newTicket]);
                              setActiveEditTicketTab(editLineItems.length);
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            title="Collapse sidebar"
                            onClick={() => setIsEditTicketSidebarCollapsed(true)}
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1 pb-2 border-b border-slate-200 dark:border-slate-800">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          title="Expand sidebar"
                          onClick={() => setIsEditTicketSidebarCollapsed(false)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 hover:bg-primary/10 text-primary"
                          title="Add Ticket"
                          onClick={() => {
                            const newTicket = createDefaultTicketItem();
                            setEditLineItems((prev) => [...prev, newTicket]);
                            setActiveEditTicketTab(editLineItems.length);
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    )}

                          <div className="space-y-1.5 max-h-[550px] overflow-y-auto pr-0.5">
                            {editLineItems.map((li, idx) => {
                              const isSelected = activeEditTicketTab === idx;
                              const paxName = li.pax_name || `Ticket ${idx + 1}`;
                              const tktNum = li.ticket_number || "";

                                if (isEditTicketSidebarCollapsed) {
                                  return (
                                    <div
                                      key={idx}
                                      onClick={() => setActiveEditTicketTab(idx)}
                                      title={`${paxName}${tktNum ? ` (${tktNum})` : ""}`}
                                      className={`h-9 w-9 rounded-xl flex items-center justify-center text-xs font-extrabold cursor-pointer transition-all mx-auto border ${
                                        isSelected
                                          ? "bg-blue-600 text-white border-blue-500 shadow-md ring-2 ring-blue-500/40 dark:bg-blue-600 dark:text-white dark:border-blue-400"
                                          : "bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                                      }`}
                                    >
                                      {idx + 1}
                                    </div>
                                  );
                                }

                                return (
                                  <div
                                    key={idx}
                                    onClick={() => setActiveEditTicketTab(idx)}
                                    className={`group relative flex items-center justify-between p-2.5 rounded-xl text-xs cursor-pointer transition-all border ${
                                      isSelected
                                        ? "bg-blue-600 text-white border-blue-600 dark:bg-blue-600 dark:text-white dark:border-blue-500 shadow-md font-semibold"
                                        : "bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700/70 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700/80"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                                        isSelected ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                                      }`}>
                                        {idx + 1}
                                      </span>
                                      <div className="truncate min-w-0">
                                        <p className={`truncate text-[11.5px] leading-tight font-bold ${
                                          isSelected ? "text-white" : "text-slate-800 dark:text-slate-200"
                                        }`}>
                                          {paxName}
                                        </p>
                                        {tktNum && (
                                          <p className={`text-[9.5px] truncate font-mono mt-0.5 ${
                                            isSelected ? "text-white/80" : "text-slate-400 dark:text-slate-400"
                                          }`}>
                                            {tktNum}
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    {editLineItems.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const updated = editLineItems.filter((_, i) => i !== idx);
                                          setEditLineItems(updated);
                                          if (activeEditTicketTab >= updated.length) setActiveEditTicketTab(Math.max(0, updated.length - 1));
                                        }}
                                        className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                                          isSelected ? "hover:bg-white/20 text-white" : "hover:bg-red-100 dark:hover:bg-red-950/50 text-slate-400 hover:text-red-600"
                                        }`}
                                        title="Delete ticket"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                );
                            })}
                          </div>

                          {!isEditTicketSidebarCollapsed && (
                            <div className="pt-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full h-8 text-[11px] px-1.5 gap-1 border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161619] hover:bg-primary/5 hover:border-primary"
                                onClick={() => {
                                  const newTicket = createDefaultTicketItem();
                                  setEditLineItems((prev) => [...prev, newTicket]);
                                  setActiveEditTicketTab(editLineItems.length);
                                }}
                              >
                                <Plus className="h-3.5 w-3.5" /> Add Ticket
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Right Active Ticket Form */}
                        <div className="flex-1 min-w-0 w-full">
                          {renderTicketForm(editLineItems[activeEditTicketTab] || editLineItems[0], activeEditTicketTab, true)}
                        </div>
                      </div>

                      {/* Multi-Ticket Grand Total Summary */}
                      {editLineItems.length > 1 && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs font-semibold">
                          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                            <Layers className="h-4 w-4" />
                            <span>Combined Invoice: <strong>{editLineItems.length} Passenger Tickets</strong></span>
                          </div>
                          <div className="flex items-center gap-4 font-mono">
                            <span>Grand Total Due: <strong className="text-primary text-sm">PKR {editLineItems.reduce((sum, item) => sum + (item.customer_net || 0), 0).toLocaleString()}</strong></span>
                            <span>Total Agency Margin: <strong className="text-blue-600 dark:text-blue-400">PKR {editLineItems.reduce((sum, item) => sum + (item.agency_margin || 0), 0).toLocaleString()}</strong></span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Non-ticket Line Items */
                    editLineItems.map((li, idx) => (
                      <div key={idx} className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 space-y-3 bg-gray-50/50">
                        <Input
                          placeholder="Description"
                          value={li.description}
                          onChange={(e) => {
                            const arr = [...editLineItems];
                            arr[idx].description = e.target.value;
                            setEditLineItems(arr);
                          }}
                          className="h-9 text-[13px]"
                        />
                      </div>
                    ))
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <Button variant="outline" onClick={() => setEditInvoiceId(null)}>Cancel</Button>
                    <Button
                      onClick={saveEditInvoice}
                      disabled={isSavingEdit}
                      className={`gap-2 transition-all ${saveSuccess ? "bg-emerald-600 hover:bg-emerald-700 text-white font-semibold" : ""}`}
                    >
                      {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : saveSuccess ? <Check className="h-4 w-4" /> : null}
                      {isSavingEdit ? "Saving..." : saveSuccess ? "Saved ✓" : "Save Changes"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}
        </div>
      ) : (
        /* Invoices List View */
        <div className="space-y-5">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">
                Invoices{typeFilter ? ` — ${typeFilter}s` : ""}
              </h1>
              <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">Manage ticket sales, airline billing, and travel invoices</p>
            </div>
            <Button
              onClick={() => {
                setEditInvoiceId(null);
                setShowNew(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" /> New Invoice / Ticket Sale
            </Button>
          </div>

          {/* Modern Search & Filters Bar */}
          <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm mb-5">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by invoice #, customer, passenger, ticket, PNR..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8 h-9 text-[13px] bg-slate-50/50 dark:bg-[#161619] border-slate-200 dark:border-slate-800"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              {/* Date Range Filter */}
              <div className="w-36">
                <Select value={dateRangeFilter} onValueChange={(v) => setDateRangeFilter(v || "all")}>
                  <SelectTrigger className="h-9 text-[12px] bg-slate-50/50 dark:bg-[#161619] border-slate-200 dark:border-slate-800">
                    <SelectValue placeholder="Date Range">
                      {(val) => {
                        const labels: Record<string, string> = {
                          all: "All Dates",
                          today: "Today",
                          this_week: "This Week",
                          last_week: "Last Week",
                          this_month: "This Month",
                          last_month: "Last Month",
                        };
                        return labels[val] || "All Dates";
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Dates</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="this_week">This Week</SelectItem>
                    <SelectItem value="last_week">Last Week</SelectItem>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="last_month">Last Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Payment Status Filter (Paid / Partial / Unpaid) */}
              <div className="w-32">
                <Select value={paymentStatusFilter} onValueChange={(v) => setPaymentStatusFilter(v || "all")}>
                  <SelectTrigger className="h-9 text-[12px] bg-slate-50/50 dark:bg-[#161619] border-slate-200 dark:border-slate-800">
                    <SelectValue placeholder="Payment">
                      {(val) => {
                        const labels: Record<string, string> = {
                          all: "All Payments",
                          Paid: "Paid",
                          Partial: "Partial",
                          Unpaid: "Unpaid",
                        };
                        return labels[val] || "All Payments";
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Payments</SelectItem>
                    <SelectItem value="Paid">Paid</SelectItem>
                    <SelectItem value="Partial">Partial</SelectItem>
                    <SelectItem value="Unpaid">Unpaid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Status Filter (Draft / Posted / Voided) */}
              <div className="w-32">
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v || "all")}>
                  <SelectTrigger className="h-9 text-[12px] bg-slate-50/50 dark:bg-[#161619] border-slate-200 dark:border-slate-800">
                    <SelectValue placeholder="Status">
                      {(val) => {
                        const labels: Record<string, string> = {
                          all: "All Status",
                          Draft: "Draft",
                          Posted: "Posted",
                          Voided: "Voided",
                        };
                        return labels[val] || "All Status";
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Posted">Posted</SelectItem>
                    <SelectItem value="Voided">Voided</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Customer Filter */}
              <div className="w-44">
                <Select value={customerFilter} onValueChange={(v) => setCustomerFilter(v || "all")}>
                  <SelectTrigger className="h-9 text-[12px] bg-slate-50/50 dark:bg-[#161619] border-slate-200 dark:border-slate-800">
                    <SelectValue placeholder="All Customers">
                      {(val) => val === "all" ? "All Customers" : getCustomerName(val)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    {customers.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Reset Filters Button */}
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="h-9 px-2 text-[12px] text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 gap-1"
                  title="Reset all filters"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table Card */}
      <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
        <CardHeader className="px-6 pt-5 pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-50 flex items-center gap-2">
            <span>Invoice Register</span>
            <Badge variant="secondary" className="text-[11px] font-mono font-normal">
              {invoices.length} {invoices.length === 1 ? "invoice" : "invoices"}
            </Badge>
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
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Invoice #</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Customer</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Doc Status</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Payment</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Currency</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Total Amount</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Due Balance</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Pay Mode</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-[13px] text-gray-400">
                        {hasActiveFilters ? "No invoices found matching your filters. Try clearing filters." : "No invoices recorded yet."}
                      </TableCell>
                    </TableRow>
                  ) : invoices.map((inv) => (
                    <TableRow
                      key={inv._id}
                      onDoubleClick={() => openEditDialog(inv)}
                      className="border-gray-100 dark:border-[#1e1e21] hover:bg-gray-100/80 dark:hover:bg-[#1a1a1d] cursor-pointer transition-colors select-none"
                      title="Double-click to view/edit invoice details"
                    >
                      <TableCell className="font-mono text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                        {inv.invoice_number}
                      </TableCell>
                      <TableCell className="text-[13px] text-gray-600 dark:text-gray-300">
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {typeof inv.customer_id === "object" ? inv.customer_id.name : "-"}
                        </div>
                        {inv.print_name && inv.print_name !== (typeof inv.customer_id === "object" ? inv.customer_id.name : "") && (
                          <span className="text-[11px] text-slate-400 block">{inv.print_name}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${statusStyles[inv.status] || ""}`}>
                          {inv.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${paymentStyles[inv.payment_status || "Unpaid"] || ""}`}>
                          {inv.payment_status || "Unpaid"}
                        </span>
                      </TableCell>
                      <TableCell className="text-[13px] text-gray-500">{inv.currency}</TableCell>
                      <TableCell className="text-right font-mono text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                        {inv.total_amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[12px]">
                        <span className={inv.due_amount && inv.due_amount > 0 ? "font-semibold text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}>
                          {(inv.due_amount ?? inv.total_amount).toLocaleString()}
                        </span>
                        {inv.paid_amount !== undefined && inv.paid_amount > 0 && (
                          <span className="block text-[10px] text-slate-400">
                            Paid: {inv.paid_amount.toLocaleString()}
                          </span>
                        )}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px] font-mono">{inv.payment_mode || "CR"}</Badge></TableCell>
                      <TableCell className="text-[12px] text-gray-500">{new Date(inv.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteInvoiceId} onOpenChange={() => setDeleteInvoiceId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" /> Delete Invoice
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-[13px] text-gray-600 dark:text-gray-300">
              Are you sure you want to permanently delete this invoice? All associated line items, flight legs, and tax breakdowns will be deleted.
            </p>
            <p className="text-[12px] font-semibold text-rose-600">
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <Button variant="outline" onClick={() => setDeleteInvoiceId(null)} disabled={deleteLoading}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDeleteInvoice} disabled={deleteLoading} className="gap-2">
                {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete Permanently
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Void Dialog */}
      <Dialog open={!!voidDialog} onOpenChange={() => setVoidDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-lg font-semibold">Void Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-[13px]">Reason for voiding</Label>
              <Textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Why is this invoice being voided?" className="min-h-[80px]" />
            </div>
            <Button variant="destructive" onClick={voidInvoice} disabled={!voidReason} className="w-full gap-2">
              <Ban className="h-4 w-4" /> Void Invoice
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Credit Note Dialog */}
      <Dialog open={!!creditDialog} onOpenChange={() => setCreditDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-lg font-semibold">Issue Credit Note</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-[13px]">Credit Amount</Label>
              <Input type="number" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} placeholder="0" className="h-10 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Reason</Label>
              <Textarea value={creditReason} onChange={(e) => setCreditReason(e.target.value)} placeholder="Reason for issuing credit note..." className="min-h-[80px]" />
            </div>
            <Button onClick={issueCreditNote} disabled={!creditAmount || !creditReason} className="w-full h-10 gap-2">
              <CreditCard className="h-4 w-4" /> Issue Credit Note
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Audit Logs Dialog */}
      <Dialog open={!!auditDialogInvoice} onOpenChange={() => setAuditDialogInvoice(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Audit Trail — {auditDialogInvoice?.invoice_number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {loadingLogs ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : auditLogs.length === 0 ? (
              <p className="text-center py-8 text-[13px] text-gray-400">No modifications logged yet.</p>
            ) : (
              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div key={log._id} className="p-3 rounded-lg border border-gray-100 dark:border-[#1e1e21] bg-gray-50/50 dark:bg-[#0e0e10]/30 text-[12px] space-y-1">
                    <div className="flex items-center justify-between text-gray-500">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{log.changed_by?.name || "System"}</span>
                      <span>{new Date(log.changed_at).toLocaleString()}</span>
                    </div>
                    <p className="font-mono text-[11px] text-gray-700 dark:text-gray-300">
                      Changed <span className="font-bold">{log.field_changed}</span> from <span className="text-red-500">{String(log.old_value)}</span> to <span className="text-emerald-500 font-bold">{String(log.new_value)}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
      <InvoicesPageContent />
    </Suspense>
  );
}
