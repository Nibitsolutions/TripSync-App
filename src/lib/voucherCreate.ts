import { Voucher } from "@/models";
import type { SessionUser } from "@/lib/api-helpers";
import { voucherBalanceError, voucherTotals } from "@/lib/voucherBalance";
import { nextVoucherNumber, VOUCHER_PREFIXES, VoucherPrefix } from "@/lib/numbering";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type CreateVoucherResult = { ok: true; voucher: any } | { ok: false; status: number; error: string };

/**
 * Create a Draft voucher from a voucher-form payload: type / date check, strict balance check,
 * server-side totals and the next RV-1 / PV-1 … number. Used by the voucher screen and bulk upload.
 */
export async function createVoucher(user: SessionUser, body: Record<string, any>): Promise<CreateVoucherResult> {
  if (!body.voucher_type || !body.voucher_date) {
    return { ok: false, status: 400, error: "voucher_type and voucher_date are required" };
  }
  if (!(VOUCHER_PREFIXES as readonly string[]).includes(body.voucher_type)) {
    return { ok: false, status: 400, error: `voucher_type must be one of: ${VOUCHER_PREFIXES.join(", ")}` };
  }

  const balanceError = voucherBalanceError(body.entries);
  if (balanceError) return { ok: false, status: 400, error: `Cannot save voucher: ${balanceError}` };
  const { totalDebit, totalCredit } = voucherTotals(body.entries);

  // Sequential number per voucher type (RV-1, PV-1, …)
  const voucherNumber = await nextVoucherNumber(user.tenant_id, body.voucher_type as VoucherPrefix);

  const voucher = await Voucher.create({
    ...body,
    total_debit: totalDebit,
    total_credit: totalCredit,
    tenant_id: user.tenant_id,
    voucher_number: voucherNumber,
    created_by: user.user_id,
    status: "Draft",
  });
  return { ok: true, voucher };
}
