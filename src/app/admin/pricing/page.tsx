"use client";

import { useEffect, useState } from "react";
import { Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ActionDialog, ActionSpec, DataTable, ErrorNote, Field, Loading, NativeSelect, PageHeader, Panel, StatusBadge, Tabs, Td, Th,
  api, dmy, label, pkr, qs, useApi, useCan, useDebounced,
} from "@/components/platform/kit";
import { QuoteBreakdown, QuoteView } from "@/components/platform/order-form";

/* eslint-disable @typescript-eslint/no-explicit-any */
const ORDER_TYPES = ["NEW", "CONVERSION", "RENEWAL", "UPGRADE", "REACTIVATION"];

function Calculator() {
  const [f, setF] = useState({ seats: "10", branches: "2", term_quarters: "2", promo_code: "" });
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const key = useDebounced(JSON.stringify(f), 300);
  useEffect(() => {
    api<{ quote: QuoteView }>("/api/admin/pricing/quote", { body: { seats: Number(f.seats), branches: Number(f.branches), term_quarters: Number(f.term_quarters), promo_code: f.promo_code || undefined } })
      .then((r) => { setQuote(r.quote); setErr(null); })
      .catch((e) => { setQuote(null); setErr(e.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <Panel title="Quote calculator (new customer)">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <Field label="Seats"><Input type="number" value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value })} /></Field>
        <Field label="Branches"><Input type="number" value={f.branches} onChange={(e) => setF({ ...f, branches: e.target.value })} /></Field>
        <Field label="Quarters"><NativeSelect className="w-full" value={f.term_quarters} onChange={(v) => setF({ ...f, term_quarters: v })} options={["1", "2", "3", "4"].map((q) => ({ value: q, label: `${q} (${Number(q) * 3} mo)` }))} /></Field>
        <Field label="Promo code"><Input value={f.promo_code} onChange={(e) => setF({ ...f, promo_code: e.target.value.toUpperCase() })} className="font-mono" /></Field>
      </div>
      <ErrorNote message={err} />
      <QuoteBreakdown quote={quote} />
    </Panel>
  );
}

export default function PricingPage() {
  const can = useCan();
  const write = can("pricing.write");
  const [tab, setTab] = useState("promotions");
  const [f, setF] = useState({ kind: "", status: "", q: "" });
  const q = useDebounced(f.q);
  const promos = useApi<{ data: any[] }>(tab === "promotions" ? `/api/admin/promotions${qs({ kind: f.kind, status: f.status, q })}` : null, []);
  const books = useApi<{ data: any[] }>(tab === "price-books" ? "/api/admin/price-books" : null, []);
  const lookups = useApi<{ earners: { id: string; name: string; type: string }[] }>("/api/admin/lookups");
  const [spec, setSpec] = useState<ActionSpec | null>(null);

  const newCampaign = () =>
    setSpec({
      title: "New campaign (automatic discount)",
      description: "Applies automatically to eligible orders. Only one campaign applies at a time (largest discount); promo codes stack on top.",
      fields: [
        { name: "name", label: "Name", required: true },
        { name: "description", label: "Description" },
        { name: "discount_type", label: "Discount type", type: "select", options: ["PERCENT", "FLAT"], defaultValue: "PERCENT", required: true },
        { name: "value", label: "Value (% or PKR)", type: "number", required: true },
        { name: "types", label: "Order types (comma separated)", defaultValue: "NEW,CONVERSION,RENEWAL,REACTIVATION", hint: ORDER_TYPES.join(", ") },
        { name: "starts_at", label: "Starts", type: "date" },
        { name: "ends_at", label: "Ends", type: "date" },
      ],
      confirmLabel: "Create campaign",
      run: (v) => api("/api/admin/promotions", { body: { kind: "CAMPAIGN", ...v, value: Number(v.value), applies_to_order_types: String(v.types).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean), starts_at: v.starts_at ? `${v.starts_at}T00:00:00+05:00` : null, ends_at: v.ends_at ? `${v.ends_at}T23:59:59+05:00` : null } }),
      onDone: promos.reload,
    });
  const newCode = () =>
    setSpec({
      title: "New promo code",
      fields: [
        { name: "code", label: "Code (4–20 letters/digits)", required: true },
        { name: "owner_earner_id", label: "Owner (sales executive / affiliate)", type: "select", options: (lookups.data?.earners ?? []).map((e) => ({ value: e.id, label: `${e.name} (${label(e.type)})` })) },
        { name: "discount_type", label: "Discount type", type: "select", options: ["PERCENT", "FLAT"], defaultValue: "PERCENT", required: true },
        { name: "value", label: "Value (% or PKR)", type: "number", required: true },
        { name: "max_redemptions", label: "Max redemptions", type: "number" },
        { name: "first_order_only", label: "First order only", type: "checkbox", placeholder: "Valid only if the agency has no paid order" },
        { name: "one_per_agency", label: "Once per agency", type: "checkbox", defaultValue: true, placeholder: "Each agency can use it once" },
        { name: "starts_at", label: "Starts", type: "date" },
        { name: "ends_at", label: "Ends", type: "date" },
      ],
      confirmLabel: "Create code",
      run: (v) => api("/api/admin/promotions", { body: { kind: "PROMO_CODE", ...v, code: String(v.code).toUpperCase(), value: Number(v.value), starts_at: v.starts_at ? `${v.starts_at}T00:00:00+05:00` : null, ends_at: v.ends_at ? `${v.ends_at}T23:59:59+05:00` : null } }),
      onDone: promos.reload,
    });
  const newBook = () =>
    setSpec({
      title: "New price book",
      description: "Price books are immutable. Existing orders keep their price; agencies pay the new price at their next order. Announce increases with an OPERATIONAL broadcast ≥ 30 days ahead.",
      fields: [
        { name: "name", label: "Name", required: true },
        { name: "base_monthly_fee", label: "Base monthly fee (PKR)", type: "number", required: true },
        { name: "included_seats", label: "Included seats", type: "number", required: true },
        { name: "included_branches", label: "Included branches", type: "number", required: true },
        { name: "seat_monthly_rate", label: "Extra seat / month", type: "number", required: true },
        { name: "branch_monthly_rate", label: "Extra branch / month", type: "number", required: true },
        { name: "effective_from", label: "Effective from (empty = now)", type: "date" },
        { name: "note", label: "Note" },
      ],
      confirmLabel: "Create price book",
      run: (v) => api("/api/admin/price-books", { body: { ...v, effective_from: v.effective_from ? `${v.effective_from}T00:00:00+05:00` : null } }),
      onDone: books.reload,
    });
  const editPromo = (p: any) =>
    setSpec({
      title: `Edit ${p.title}`,
      description: p.status === "SCHEDULED" ? "Not started yet — you can still change the end date or disable it." : "Started promotions can only change end date or be disabled.",
      fields: [
        { name: "ends_at", label: "Ends", type: "date", defaultValue: p.ends_at ? new Date(p.ends_at).toISOString().slice(0, 10) : "" },
        ...(p.kind === "PROMO_CODE" ? [{ name: "max_redemptions", label: "Max redemptions", type: "number" as const, defaultValue: p.max_redemptions ? String(p.max_redemptions) : "" }] : []),
      ],
      confirmLabel: "Save",
      run: (v) => api(`/api/admin/promotions/${p.id}`, { method: "PATCH", body: { ends_at: v.ends_at ? `${v.ends_at}T23:59:59+05:00` : null, ...(p.kind === "PROMO_CODE" ? { max_redemptions: v.max_redemptions || null } : {}) } }),
      onDone: promos.reload,
    });
  const toggle = async (p: any) => {
    await api(`/api/admin/promotions/${p.id}`, { method: "PATCH", body: { is_disabled: p.status !== "DISABLED" } }).catch((e) => alert(e.message));
    promos.reload();
  };

  return (
    <div>
      <PageHeader
        title="Pricing & Promotions"
        subtitle="Versioned price book, scheduled campaigns and promo codes (never deleted)"
        actions={write && (
          <>
            <Button variant="outline" className="gap-1.5" onClick={newBook}><Plus className="h-4 w-4" /> Price book</Button>
            <Button variant="outline" className="gap-1.5" onClick={newCampaign}><Plus className="h-4 w-4" /> Campaign</Button>
            <Button className="gap-1.5 bg-red-600 hover:bg-red-700 text-white" onClick={newCode}><Plus className="h-4 w-4" /> Promo code</Button>
          </>
        )}
      />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "promotions", label: "Promotions" }, { value: "price-books", label: "Price books" }, { value: "calculator", label: "Quote calculator" }]} />

      {tab === "promotions" && (
        <Panel>
          <div className="flex flex-wrap gap-2 py-2">
            <Input placeholder="Search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} className="h-9 w-[220px]" />
            <NativeSelect value={f.kind} onChange={(v) => setF({ ...f, kind: v })} placeholder="Campaigns & codes" options={[{ value: "CAMPAIGN", label: "Campaigns" }, { value: "PROMO_CODE", label: "Promo codes" }]} />
            <NativeSelect value={f.status} onChange={(v) => setF({ ...f, status: v })} placeholder="Any status" options={["SCHEDULED", "ACTIVE", "EXPIRED", "DISABLED"]} />
            <a href={`/api/admin/promotions${qs({ ...f, format: "csv" })}`}><Button variant="outline" size="sm" className="h-9 gap-1.5"><Download className="h-3.5 w-3.5" /> CSV</Button></a>
          </div>
          <ErrorNote message={promos.error} />
          {promos.loading && !promos.data ? <Loading /> : (
            <DataTable empty={!promos.data?.data.length} head={<><Th>Title</Th><Th>Type</Th><Th>Status</Th><Th>Eligibility</Th><Th>Usage</Th><Th>Window</Th><Th>Owner</Th>{write && <Th>Actions</Th>}</>}>
              {promos.data?.data.map((p) => (
                <tr key={p.id}>
                  <Td><p className={`font-semibold ${p.kind === "PROMO_CODE" ? "font-mono" : ""}`}>{p.title}</p><p className="text-[11px] text-gray-400">{p.summary}</p></Td>
                  <Td className="text-[12px]">{p.kind === "CAMPAIGN" ? "Campaign · automatic" : "Code"}</Td>
                  <Td><StatusBadge status={p.status} /></Td>
                  <Td className="text-[12px]">{p.eligibility}</Td>
                  <Td>{p.usage}{p.max_redemptions ? ` / ${p.max_redemptions}` : ""}</Td>
                  <Td className="text-[12px] whitespace-nowrap">{dmy(p.starts_at)} → {p.ends_at ? dmy(p.ends_at) : "no end"}</Td>
                  <Td className="text-[12px]">{p.owner ?? "-"}</Td>
                  {write && (
                    <Td>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => editPromo(p)}>Edit</Button>
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => toggle(p)}>{p.status === "DISABLED" ? "Enable" : "Disable"}</Button>
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
            </DataTable>
          )}
        </Panel>
      )}

      {tab === "price-books" && (
        <Panel>
          <p className="text-[12px] text-gray-500 py-2">Monthly price = base + seat rate × extra seats + branch rate × extra branches. Term price = monthly × months (1–4 quarters).</p>
          <ErrorNote message={books.error} />
          {books.loading && !books.data ? <Loading /> : (
            <DataTable empty={!books.data?.data.length} head={<><Th>Name</Th><Th>State</Th><Th>Effective from</Th><Th className="text-right">Base / mo</Th><Th>Included</Th><Th className="text-right">Seat / mo</Th><Th className="text-right">Branch / mo</Th><Th>Note</Th></>}>
              {books.data?.data.map((b) => (
                <tr key={b._id}>
                  <Td className="font-semibold">{b.name}</Td>
                  <Td><StatusBadge status={b.state === "SUPERSEDED" ? "EXPIRED" : b.state} /></Td>
                  <Td>{dmy(b.effective_from, true)}</Td>
                  <Td className="text-right font-mono">{pkr(b.base_monthly_fee)}</Td>
                  <Td className="text-[12px]">{b.included_seats} seats · {b.included_branches} br</Td>
                  <Td className="text-right font-mono">{pkr(b.seat_monthly_rate)}</Td>
                  <Td className="text-right font-mono">{pkr(b.branch_monthly_rate)}</Td>
                  <Td className="text-[12px]">{b.note}</Td>
                </tr>
              ))}
            </DataTable>
          )}
        </Panel>
      )}

      {tab === "calculator" && <Calculator />}
      <ActionDialog spec={spec} onClose={() => setSpec(null)} />
    </div>
  );
}
