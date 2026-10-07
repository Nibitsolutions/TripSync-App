import { BankAccount } from "@/models";
import type { SessionUser } from "@/lib/api-helpers";
import { createVoucher } from "@/lib/voucherCreate";
import { voucherBalanceError } from "@/lib/voucherBalance";
import { ensureBankAccounts } from "@/lib/bankAccountDefaults";
import { bankAccountLabel, BankAccountKind, CASH_IN_HAND_KEY } from "@/lib/bankAccounts";
import { checkRow, normaliseRow, RowValues } from "./columns";
import {
  BANK_SIDE,
  buildVoucherEntry,
  UploadVoucherType,
  VOUCHER_LEVEL_KEYS,
  VOUCHER_TEMPLATE_COLUMNS,
  VOUCHER_TYPE_LABELS,
  VoucherEntryInput,
} from "./voucherTemplates";
import { parseUpload } from "./xlsx";
import { MAX_UPLOAD_ROWS, UploadRejected, UploadSummary } from "./processInvoices";

/**
 * Process an uploaded voucher spreadsheet for one voucher type. Valid groups (same Voucher
 * Ref, balanced) are created as Draft vouchers; invalid rows / groups are skipped with a reason.
 */
export async function processVoucherUpload(user: SessionUser, type: UploadVoucherType, file: ArrayBuffer): Promise<UploadSummary> {
  const columns = VOUCHER_TEMPLATE_COLUMNS[type];
  const label = VOUCHER_TYPE_LABELS[type];
  const parsed = await parseUpload(file, columns);

  if (!parsed.kind) throw new UploadRejected(`This is not a TripSync template. Download the ${label} template from this page and fill that in.`);
  if (parsed.kind !== "voucher" || parsed.type !== type) {
    const other = parsed.kind === "voucher" ? VOUCHER_TYPE_LABELS[parsed.type as UploadVoucherType] ?? parsed.type : `${parsed.type} invoice`;
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

  const rows = parsed.rows.map(({ row, values }) => {
    checkRow(values, columns).forEach((p) => addError(row, p));
    return { row, values: normaliseRow(values, columns) };
  });

  // Enabled Bank / Cash entries; the voucher's bank account must be one of them
  await ensureBankAccounts(user.tenant_id);
  const banks = await BankAccount.find({ tenant_id: user.tenant_id, enabled: true }).lean<
    Array<{ kind: BankAccountKind; bank_name: string; account_title: string; account_number: string; branch: string; name: string; system_key: string | null }>
  >();
  const bankLabels = new Map<string, string>();
  for (const b of banks) {
    const lbl = bankAccountLabel(b);
    bankLabels.set(lbl.toLowerCase(), lbl);
    if (b.kind === "Bank" && b.account_number) bankLabels.set(b.account_number.toLowerCase(), lbl);
  }
  const cashInHandDoc = banks.find((b) => b.system_key === CASH_IN_HAND_KEY);
  const cashInHand = cashInHandDoc ? bankAccountLabel(cashInHandDoc) : "Cash in Hand";

  const bankSide = BANK_SIDE[type];
  if (bankSide) {
    for (const { row, values } of rows) {
      if (values.bank_account && !bankLabels.has(values.bank_account.toLowerCase())) {
        addError(row, `Bank / Cash account '${values.bank_account}' is not an enabled entry in Agency Settings → Banks & Cash`);
      }
    }
  } else {
    for (const { row, values } of rows) {
      const d = Number(values.debit || 0);
      const c = Number(values.credit || 0);
      if (d && c) addError(row, "Fill either Debit or Credit on a row, not both");
      if (!d && !c && !rowErrors.has(row)) addError(row, "Debit or Credit is missing");
    }
  }

  const groups = new Map<string, Array<{ row: number; values: RowValues }>>();
  for (const r of rows) {
    const ref = r.values.voucher_ref || `(row ${r.row})`;
    groups.set(ref, [...(groups.get(ref) || []), r]);
  }

  for (const [ref, groupRows] of groups) {
    const first = groupRows[0].values;
    for (const { row, values } of groupRows.slice(1)) {
      for (const key of VOUCHER_LEVEL_KEYS) {
        if (key === "voucher_ref" || !values[key] || values[key] === first[key]) continue;
        const header = columns.find((c) => c.key === key)?.header || key;
        addError(row, `${header} differs from the first row of Voucher Ref ${ref}`);
      }
    }

    let entries: VoucherEntryInput[] = [];
    let bankAccount = "";
    if (!groupRows.some((r) => rowErrors.has(r.row))) {
      entries = groupRows.map(({ values }) => buildVoucherEntry(type, values, cashInHand));
      if (bankSide) {
        bankAccount = bankLabels.get(first.bank_account.toLowerCase())!;
        const amount = Number(first.bank_amount || 0);
        entries = [
          {
            branch: "01", ref_code: "", ref_no: "", adj_date: "", description: first.remarks || "",
            account_code: bankAccount,
            debit: bankSide === "debit" ? amount : 0,
            credit: bankSide === "credit" ? amount : 0,
          },
          ...entries,
        ];
      }
      const balanceError = voucherBalanceError(entries);
      if (balanceError) groupRows.forEach((r, i) => i === 0 && addError(r.row, `Voucher Ref ${ref}: ${balanceError}`));
    }

    const rowNumbers = groupRows.map((r) => r.row);
    if (groupRows.some((r) => rowErrors.has(r.row))) {
      const multi = groupRows.length > 1;
      for (const { row } of groupRows) {
        const reason = rowErrors.get(row)?.join("; ") || "another row of this Voucher Ref is invalid";
        summary.skipped.push({ row, ref, reason: multi ? `${reason} (whole Voucher Ref ${ref} skipped)` : reason });
      }
      continue;
    }

    const result = await createVoucher(user, {
      voucher_type: type,
      voucher_date: first.voucher_date,
      name_on_voucher: first.name_on_voucher,
      manual_receipt_no: first.manual_receipt_no,
      cost_center: first.cost_center,
      cheque_no: first.cheque_no,
      cheque_status: first.cheque_status,
      debit_account: bankAccount,
      entries,
      remarks: first.remarks,
      print_format: first.print_format || "In House",
    });
    if (result.ok) summary.created.push({ ref, number: result.voucher.voucher_number, rows: rowNumbers });
    else for (const row of rowNumbers) summary.skipped.push({ ref, row, reason: result.error });
  }

  summary.skipped.sort((a, b) => a.row - b.row);
  return summary;
}
