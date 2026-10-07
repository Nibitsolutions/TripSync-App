import { Customer, Invoice, InvoiceLineItem, Supplier, TaxCode, User } from "@/models";
import type { SessionUser } from "@/lib/api-helpers";
import { createInvoice } from "@/lib/invoiceCreate";
import { validateInvoiceForPosting } from "@/lib/invoiceValidation";
import { checkRow, normaliseRow, RowValues } from "./columns";
import {
  buildServiceItem,
  buildTicketItem,
  INVOICE_LEVEL_KEYS,
  INVOICE_TEMPLATE_COLUMNS,
  UPLOAD_TYPE_LABELS,
  UploadInvoiceType,
} from "./invoiceTemplates";
import { parseUpload } from "./xlsx";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const MAX_UPLOAD_ROWS = 300;

export interface UploadSummary {
  total_rows: number;
  created: Array<{ ref: string; number: string; rows: number[] }>;
  skipped: Array<{ row: number; ref: string; reason: string }>;
}

export class UploadRejected extends Error {}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ci = (values: string[]) => values.map((v) => new RegExp(`^${escape(v)}$`, "i"));

/**
 * Process an uploaded invoice spreadsheet for one invoice type. Valid groups (same Invoice
 * Ref) are created as Draft invoices; invalid rows / groups are skipped with a reason.
 */
export async function processInvoiceUpload(user: SessionUser, type: UploadInvoiceType, file: ArrayBuffer): Promise<UploadSummary> {
  const columns = INVOICE_TEMPLATE_COLUMNS[type];
  const label = UPLOAD_TYPE_LABELS[type];
  const parsed = await parseUpload(file, columns);

  if (!parsed.kind) throw new UploadRejected(`This is not a TripSync template. Download the ${label} template from this page and fill that in.`);
  if (parsed.kind !== "invoice" || parsed.type !== type) {
    const other = parsed.kind === "invoice" ? `${UPLOAD_TYPE_LABELS[parsed.type as UploadInvoiceType] ?? parsed.type} invoice` : `${parsed.type} voucher`;
    throw new UploadRejected(`This file is the ${other} template. Upload it on its own page, or use the ${label} template here.`);
  }
  if (parsed.missingHeaders.length) {
    throw new UploadRejected(`The file's columns were changed (missing: ${parsed.missingHeaders.join(", ")}). Download a fresh ${label} template.`);
  }
  if (parsed.rows.length === 0) throw new UploadRejected("The file has no rows to upload.");
  if (parsed.rows.length > MAX_UPLOAD_ROWS) {
    throw new UploadRejected(`The file has ${parsed.rows.length} rows; upload at most ${MAX_UPLOAD_ROWS} rows at a time.`);
  }

  const summary: UploadSummary = { total_rows: parsed.rows.length, created: [], skipped: [] };
  const rowErrors = new Map<number, string[]>();
  const addError = (row: number, msg: string) => rowErrors.set(row, [...(rowErrors.get(row) || []), msg]);

  // 1. Column-level checks and normalisation
  const rows = parsed.rows.map(({ row, values }) => {
    checkRow(values, columns).forEach((p) => addError(row, p));
    return { row, values: normaliseRow(values, columns) };
  });

  // 2. Look up codes in bulk
  const tenant_id = user.tenant_id;
  const uniq = (key: string) => [...new Set(rows.map((r) => r.values[key]).filter(Boolean))];
  const [customers, suppliers, agents, taxCodes] = await Promise.all([
    Customer.find({ tenant_id, code: { $in: ci(uniq("customer_code")) } }).select("_id code").lean(),
    Supplier.find({ tenant_id, code: { $in: ci(uniq("supplier_code")) } }).select("_id code").lean(),
    User.find({ tenant_id, email: { $in: ci(uniq("spo_email")) } }).select("_id email").lean(),
    TaxCode.find({ tenant_id, active: true, code: { $in: ci(uniq("tax_code")) } }).select("_id code").lean(),
  ]);
  const byLower = <T extends { _id: unknown }>(docs: T[], field: keyof T) =>
    new Map(docs.map((d) => [String(d[field]).toLowerCase(), String(d._id)]));
  const customerIds = byLower(customers as any[], "code");
  const supplierIds = byLower(suppliers as any[], "code");
  const agentIds = byLower(agents as any[], "email");
  const taxCodeIds = byLower(taxCodes as any[], "code");

  for (const { row, values } of rows) {
    if (values.customer_code && !customerIds.has(values.customer_code.toLowerCase())) addError(row, `Customer Code '${values.customer_code}' not found`);
    if (values.supplier_code && !supplierIds.has(values.supplier_code.toLowerCase())) addError(row, `Supplier Code '${values.supplier_code}' not found`);
    if (values.spo_email && !agentIds.has(values.spo_email.toLowerCase())) addError(row, `SPO / Agent '${values.spo_email}' is not a team member`);
    if (values.tax_code && !taxCodeIds.has(values.tax_code.toLowerCase())) addError(row, `Tax Code '${values.tax_code}' not found or inactive`);
  }

  // 3. Ticket numbers: unique within the file and not already used in the system
  if (type === "Ticket") {
    const { formatTicketNumber } = await import("@/lib/iataAirlines");
    const seen = new Map<string, number>();
    for (const { row, values } of rows) {
      if (!values.ticket_number) continue;
      const t = formatTicketNumber(values.ticket_number);
      if (seen.has(t)) addError(row, `Ticket No. ${t} appears more than once in this file (also row ${seen.get(t)})`);
      else seen.set(t, row);
    }
    const tickets = [...seen.keys()];
    if (tickets.length) {
      const existing = await InvoiceLineItem.find({ tenant_id, ticket_number: { $in: tickets } }).select("ticket_number invoice_id").lean();
      const liveInvoices = new Set(
        (await Invoice.find({ _id: { $in: existing.map((e) => e.invoice_id) }, tenant_id, status: { $ne: "Voided" } }).select("_id").lean()).map((i) => String(i._id))
      );
      const used = new Set(existing.filter((e) => liveInvoices.has(String(e.invoice_id))).map((e) => String(e.ticket_number)));
      for (const { row, values } of rows) {
        const t = values.ticket_number ? formatTicketNumber(values.ticket_number) : "";
        if (t && used.has(t)) addError(row, `Ticket No. ${t} already exists in the system`);
      }
    }
  }

  // 4. Group rows by Invoice Ref (keeping file order)
  const groups = new Map<string, Array<{ row: number; values: RowValues }>>();
  for (const r of rows) {
    const ref = r.values.invoice_ref || `(row ${r.row})`;
    groups.set(ref, [...(groups.get(ref) || []), r]);
  }

  for (const [ref, groupRows] of groups) {
    const first = groupRows[0].values;

    // Invoice-level values come from the first row; later rows must not contradict them
    for (const { row, values } of groupRows.slice(1)) {
      for (const key of INVOICE_LEVEL_KEYS) {
        if (key === "invoice_ref" || !values[key] || values[key] === first[key]) continue;
        const header = INVOICE_TEMPLATE_COLUMNS[type].find((c) => c.key === key)?.header || key;
        addError(row, `${header} differs from the first row of Invoice Ref ${ref}`);
      }
    }

    const hasErrors = groupRows.some((r) => rowErrors.has(r.row));
    let payload: Record<string, any> | null = null;
    if (!hasErrors) {
      const line_items = groupRows.map(({ values }) => {
        const lookups = {
          supplierId: supplierIds.get(values.supplier_code.toLowerCase())!,
          taxCodeId: values.tax_code ? taxCodeIds.get(values.tax_code.toLowerCase()) : undefined,
        };
        return type === "Ticket" ? buildTicketItem(values, lookups) : buildServiceItem(type, values, lookups);
      });
      payload = {
        customer_id: customerIds.get(first.customer_code.toLowerCase()),
        print_name: first.print_name,
        visit_type: first.visit_type,
        payment_mode: first.payment_mode,
        currency: first.currency || undefined,
        custom_invoice_number: first.custom_invoice_number,
        spo_id: first.spo_email ? agentIds.get(first.spo_email.toLowerCase()) : null,
        internal_remarks: first.internal_remarks,
        remarks: first.internal_remarks,
        supplier_id: line_items[0].supplier_id,
        status: "Draft",
        line_items,
      };
      // Same required-field rules as posting from the invoice screen, checked item by item so
      // each problem is reported on its own row (invoice-level ones on the group's first row)
      groupRows.forEach(({ row }, i) => {
        const problems = validateInvoiceForPosting({
          inv_date: "valid",
          customer_id: payload!.customer_id,
          print_name: payload!.print_name,
          visit_type: payload!.visit_type,
          payment_mode: payload!.payment_mode,
          line_items: [line_items[i]],
        });
        for (const p of problems) {
          const itemProblem = p.match(/^[^:]+: (.+)$/);
          if (itemProblem) addError(row, itemProblem[1]);
          else if (i === 0) addError(row, p);
        }
      });
    }

    const rowNumbers = groupRows.map((r) => r.row);
    if (groupRows.some((r) => rowErrors.has(r.row)) || !payload) {
      const multi = groupRows.length > 1;
      for (const { row } of groupRows) {
        const own = rowErrors.get(row);
        const reason = own?.join("; ") || "another row of this Invoice Ref is invalid";
        summary.skipped.push({ row, ref, reason: multi ? `${reason} (whole Invoice Ref ${ref} skipped)` : reason });
      }
      continue;
    }

    const result = await createInvoice(user, payload, { allowRapidRepeat: true });
    if (result.ok) {
      summary.created.push({ ref, number: result.invoice.invoice_number, rows: rowNumbers });
    } else {
      for (const row of rowNumbers) summary.skipped.push({ row, ref, reason: result.error });
    }
  }

  summary.skipped.sort((a, b) => a.row - b.row);
  return summary;
}
