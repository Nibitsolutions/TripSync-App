// Bulk voucher upload (TS-0041): one template per voucher type. Rows sharing a
// "Voucher Ref" become one voucher. RV / PV / CD rows hold the counter entries; the bank /
// cash row is built from the voucher-level account and amount on its fixed side.

import { ColumnDef, RowValues } from "./columns";

export const UPLOAD_VOUCHER_TYPES = ["RV", "PV", "JV", "DN", "CD"] as const;
export type UploadVoucherType = (typeof UPLOAD_VOUCHER_TYPES)[number];

export const VOUCHER_TYPE_LABELS: Record<UploadVoucherType, string> = {
  RV: "RV - Receipt Voucher",
  PV: "PV - Payment Voucher",
  JV: "JV - Journal Voucher",
  DN: "DN - Debit Note",
  CD: "CD - Cash Deposit",
};

/** Side the bank / cash account takes on fixed-direction voucher types. */
export const BANK_SIDE: Partial<Record<UploadVoucherType, "debit" | "credit">> = { RV: "debit", PV: "credit", CD: "debit" };

const CHEQUE_STATUSES = ["Cleared", "Pending", "Bounced", "Cancelled"] as const;
const PRINT_FORMATS = ["In House", "Standard", "Compact", "Detailed"] as const;

const voucherLevel = (type: UploadVoucherType): ColumnDef[] => {
  const bankSide = BANK_SIDE[type];
  const bankCols: ColumnDef[] = bankSide
    ? [
        {
          key: "bank_account",
          header: bankSide === "credit" ? "Credit Account (Bank / Cash)" : "Debit Account (Bank / Cash)",
          required: true,
          note: "Exactly as in Agency Settings → Banks & Cash, e.g. UBL - 1102-887410 (Corporate) or Cash in Hand",
          width: 30,
        },
        {
          key: "bank_amount",
          header: bankSide === "credit" ? "Credit Amount" : "Debit Amount",
          required: true,
          kind: "number",
          note: "Must equal the total of this voucher's entry rows",
        },
      ]
    : [];
  return [
    { key: "voucher_ref", header: "Voucher Ref", required: true, note: "Rows with the same Voucher Ref become one voucher", width: 14 },
    { key: "voucher_date", header: "Voucher Date", required: true, kind: "date" },
    { key: "name_on_voucher", header: "Name on Voucher", required: true, width: 22 },
    ...bankCols,
    { key: "manual_receipt_no", header: "Manual Receipt No" },
    { key: "cheque_no", header: "Cheque No" },
    { key: "cheque_status", header: "Cheque Status", options: CHEQUE_STATUSES },
    { key: "cost_center", header: "Cost Center" },
    { key: "remarks", header: "Remarks", width: 24 },
    { key: "print_format", header: "Print Format", options: PRINT_FORMATS },
  ];
};

const entryColumns = (type: UploadVoucherType): ColumnDef[] => {
  const bankSide = BANK_SIDE[type];
  const amountCols: ColumnDef[] = bankSide
    ? [{ key: "entry_amount", header: bankSide === "credit" ? "Debit" : "Credit", required: true, kind: "number" }]
    : [
        { key: "debit", header: "Debit", kind: "number", note: "Fill Debit or Credit on each row" },
        { key: "credit", header: "Credit", kind: "number" },
      ];
  return [
    {
      key: "account_code",
      header: "Account Code",
      required: type !== "CD",
      note: type === "CD" ? "Blank = Cash in Hand" : "Customer / supplier / account name",
      width: 26,
    },
    ...amountCols,
    { key: "description", header: "Description", width: 26 },
    { key: "ref_no", header: "Ref / Inv #" },
    { key: "ref_code", header: "Ref Code" },
    { key: "adj_date", header: "Adj Date", kind: "date" },
    { key: "branch", header: "Br", note: "Blank = 01" },
  ];
};

export const VOUCHER_TEMPLATE_COLUMNS: Record<UploadVoucherType, ColumnDef[]> = Object.fromEntries(
  UPLOAD_VOUCHER_TYPES.map((t) => [t, [...voucherLevel(t), ...entryColumns(t)]])
) as Record<UploadVoucherType, ColumnDef[]>;

export const VOUCHER_LEVEL_KEYS = [
  "voucher_ref", "voucher_date", "name_on_voucher", "bank_account", "bank_amount",
  "manual_receipt_no", "cheque_no", "cheque_status", "cost_center", "remarks", "print_format",
];

export interface VoucherEntryInput {
  branch: string;
  ref_code: string;
  ref_no: string;
  adj_date: string;
  description: string;
  account_code: string;
  debit: number;
  credit: number;
}

/** Turn one row into a journal entry on the side its voucher type allows. */
export function buildVoucherEntry(type: UploadVoucherType, row: RowValues, cashInHand: string): VoucherEntryInput {
  const bankSide = BANK_SIDE[type];
  const amount = Number(row.entry_amount || 0);
  return {
    branch: row.branch || "01",
    ref_code: row.ref_code || "",
    ref_no: row.ref_no || "",
    adj_date: row.adj_date || "",
    description: row.description || "",
    account_code: row.account_code || (type === "CD" ? cashInHand : ""),
    debit: bankSide ? (bankSide === "credit" ? amount : 0) : Number(row.debit || 0),
    credit: bankSide ? (bankSide === "debit" ? amount : 0) : Number(row.credit || 0),
  };
}
