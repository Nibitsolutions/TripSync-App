"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Calendar, Plus, FileText, Trash2, X } from "lucide-react";

interface Customer { _id: string; name: string; }
interface Supplier { _id: string; name: string; }

interface Passenger {
  name: string;
  ticket_number?: string;
  passport_number?: string;
}

interface Booking {
  _id: string;
  booking_reference: string;
  customer_id: { _id: string; name: string } | string;
  supplier_id: { _id: string; name: string } | string;
  service_type: string;
  status: string;
  gds_pnr: string;
  passenger_details: Passenger[];
  itinerary_details: string;
  total_cost: number;
  total_price: number;
  margin: number;
  invoice_id: string | null;
  created_at: string;
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  // New booking form state
  const [customerId, setCustomerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [serviceType, setServiceType] = useState("Ticket");
  const [status, setStatus] = useState("Draft");
  const [pnr, setPnr] = useState("");
  const [itinerary, setItinerary] = useState("");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [passengers, setPassengers] = useState<Passenger[]>([{ name: "" }]);

  const load = useCallback(async () => {
    const res = await fetch("/api/bookings");
    const data = await res.json();
    setBookings(data.bookings || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/customers").then((r) => r.json()).then((d) => setCustomers(d.customers || []));
    fetch("/api/suppliers").then((r) => r.json()).then((d) => setSuppliers(d.suppliers || []));
  }, [load]);

  async function create() {
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId,
        supplier_id: supplierId,
        service_type: serviceType,
        status,
        gds_pnr: pnr,
        itinerary_details: itinerary,
        total_cost: parseFloat(cost) || 0,
        total_price: parseFloat(price) || 0,
        passenger_details: passengers.filter(p => p.name.trim() !== ""),
      }),
    });
    if (res.ok) {
      setShowNew(false);
      setCustomerId("");
      setSupplierId("");
      setServiceType("Ticket");
      setStatus("Draft");
      setPnr("");
      setItinerary("");
      setCost("");
      setPrice("");
      setPassengers([{ name: "" }]);
      load();
    } else {
      const d = await res.json();
      alert(d.error || "Failed to create booking");
    }
  }

  async function generateInvoice(bookingId: string) {
    const res = await fetch(`/api/bookings/${bookingId}/invoice`, { method: "POST" });
    if (res.ok) {
      alert("Invoice draft generated successfully!");
      load();
    } else {
      const d = await res.json();
      alert(d.error || "Failed to generate invoice");
    }
  }

  function addPassenger() {
    setPassengers([...passengers, { name: "" }]);
  }

  function updatePassenger(index: number, field: keyof Passenger, value: string) {
    const updated = [...passengers];
    updated[index][field] = value;
    setPassengers(updated);
  }

  const statusStyles: Record<string, string> = {
    Draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    Confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
    Ticketed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    Cancelled: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">Bookings &amp; Reservations</h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">Manage flight bookings, hotel reservations, package deals, and visas</p>
        </div>
        {!showNew && (
          <Button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Add Booking
          </Button>
        )}
      </div>

      {/* Inline Create Booking Form Card */}
      {showNew && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111113] shadow-md">
          <CardHeader className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <Calendar className="h-5 w-5 text-primary" /> New Booking
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowNew(false)} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-5">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Customer *</Label>
                  <Select value={customerId} onValueChange={(v) => v && setCustomerId(v)}>
                    <SelectTrigger className="h-10 text-[13px]"><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>{customers.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Supplier / Vendor *</Label>
                  <Select value={supplierId} onValueChange={(v) => v && setSupplierId(v)}>
                    <SelectTrigger className="h-10 text-[13px]"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>{suppliers.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Service Type</Label>
                  <Select value={serviceType} onValueChange={(v) => v && setServiceType(v)}>
                    <SelectTrigger className="h-10 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{["Ticket", "Hotel", "Package", "Umrah", "Visa", "Other"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Booking Status</Label>
                  <Select value={status} onValueChange={(v) => v && setStatus(v)}>
                    <SelectTrigger className="h-10 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{["Draft", "Confirmed", "Ticketed", "Cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">GDS PNR / Locator</Label>
                  <Input value={pnr} onChange={(e) => setPnr(e.target.value)} placeholder="e.g. AB12CD" className="h-10 text-[13px]" />
                </div>
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl border border-gray-100 dark:border-[#1e1e21] bg-gray-50/30 dark:bg-[#0e0e10]/30">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Cost Amount (Vendor Billing) *</Label>
                  <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" className="h-10 font-mono text-[13px]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Price Amount (Customer Billing) *</Label>
                  <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" className="h-10 font-mono text-[13px]" />
                </div>
              </div>

              {/* Passenger list */}
              <div className="space-y-2">
                <Label className="text-[13px] font-semibold block">Passengers</Label>
                <div className="space-y-2">
                  {passengers.map((p, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <Input value={p.name} onChange={(e) => updatePassenger(idx, "name", e.target.value)} placeholder="Passenger Name" className="h-9 flex-1 text-[13px]" />
                      <Input value={p.ticket_number || ""} onChange={(e) => updatePassenger(idx, "ticket_number", e.target.value)} placeholder="Ticket #" className="h-9 w-[130px] font-mono text-[13px]" />
                      {passengers.length > 1 && (
                        <button type="button" onClick={() => setPassengers(passengers.filter((_, i) => i !== idx))} className="h-9 w-9 flex items-center justify-center text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addPassenger} className="gap-1 text-[12px]"><Plus className="h-3 w-3" /> Add Passenger</Button>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Itinerary / Booking Details</Label>
                <Textarea value={itinerary} onChange={(e) => setItinerary(e.target.value)} placeholder="Flight itinerary / Hotel check-in notes..." className="min-h-[80px] text-[13px]" />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
                <Button onClick={create} disabled={!customerId || !supplierId || !cost || !price} className="gap-2">
                  <Calendar className="h-4 w-4" /> Save Booking
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Bookings Table Card */}
      <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
        <CardHeader className="px-6 pt-5 pb-3">
          <CardTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-50">All Bookings</CardTitle>
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
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Ref #</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Customer</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Vendor</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Type</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">PNR</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Price</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Cost</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookings.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-12 text-[13px] text-gray-400">No bookings recorded yet.</TableCell></TableRow>
                  ) : bookings.map((b) => (
                    <TableRow key={b._id} className="border-gray-100 dark:border-[#1e1e21] hover:bg-gray-50/50 dark:hover:bg-[#151517]">
                      <TableCell className="font-mono text-[13px] font-semibold text-gray-900 dark:text-gray-100">{b.booking_reference}</TableCell>
                      <TableCell className="text-[13px] text-gray-600 dark:text-gray-300">{b.customer_id && typeof b.customer_id === "object" ? b.customer_id.name : "-"}</TableCell>
                      <TableCell className="text-[13px] text-gray-600 dark:text-gray-300">{b.supplier_id && typeof b.supplier_id === "object" ? b.supplier_id.name : "-"}</TableCell>
                      <TableCell className="text-[13px] text-gray-500">{b.service_type}</TableCell>
                      <TableCell className="font-mono text-[12px] text-gray-500">{b.gds_pnr || "—"}</TableCell>
                      <TableCell className="text-right font-mono text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">{b.total_price.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-[13px] text-gray-500">{b.total_cost.toLocaleString()}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${statusStyles[b.status] || ""}`}>
                          {b.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1.5">
                          {b.status === "Confirmed" && !b.invoice_id && (
                            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]" onClick={() => generateInvoice(b._id)}>
                              <FileText className="h-3 w-3" /> Bill / Invoice
                            </Button>
                          )}
                          {b.invoice_id && (
                            <Badge variant="secondary" className="h-8 text-[11px] flex gap-1 items-center px-3 font-semibold"><FileText className="h-3.5 w-3.5" /> Billed</Badge>
                          )}
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