import { Types } from "mongoose";
import TenantCounter from "@/models/TenantCounter";
import type { InvoiceType } from "@/lib/taxCodes";

// Numbering convention (TS-0045): a short type prefix plus a plain sequential number, no
// zero-padding, each sequence starting at 1 and kept separately per agency.
// Existing records keep the numbers they already have.

export const INVOICE_PREFIXES: Record<InvoiceType, string> = {
  Ticket: "TCK",
  Hotel: "HTL",
  Umrah: "UMR",
  Hajj: "HAJ",
  Visa: "VIS",
  Transport: "TRN",
  General: "GEN",
  Insurance: "INS",
};

export const VOUCHER_PREFIXES = ["RV", "PV", "JV", "DN", "CD"] as const;
export type VoucherPrefix = (typeof VOUCHER_PREFIXES)[number];

/** Atomically take the next number of a per-agency sequence (1, 2, 3, …). */
export async function nextSequence(tenantId: Types.ObjectId | string, key: string): Promise<number> {
  const doc = await TenantCounter.findOneAndUpdate(
    { tenant_id: new Types.ObjectId(String(tenantId)), key },
    { $inc: { last_number: 1 } },
    { upsert: true, returnDocument: "after" }
  ).lean<{ last_number: number }>();
  return doc!.last_number;
}

export async function nextInvoiceNumber(tenantId: Types.ObjectId | string, type: InvoiceType): Promise<string> {
  const prefix = INVOICE_PREFIXES[type] || INVOICE_PREFIXES.General;
  return `${prefix}-${await nextSequence(tenantId, `invoice:${prefix}`)}`;
}

export async function nextCustomerCode(tenantId: Types.ObjectId | string): Promise<string> {
  return `CUS-${await nextSequence(tenantId, "customer")}`;
}

export async function nextVoucherNumber(tenantId: Types.ObjectId | string, type: VoucherPrefix): Promise<string> {
  return `${type}-${await nextSequence(tenantId, `voucher:${type}`)}`;
}
