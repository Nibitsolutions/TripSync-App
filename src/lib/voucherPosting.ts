import { Voucher } from "@/models";
import { voucherBalanceError, voucherTotals } from "@/lib/voucherBalance";
import type { SessionUser } from "@/lib/api-helpers";

export type PostVoucherResult =
  | { ok: true; voucher: InstanceType<typeof Voucher> }
  | { ok: false; status: number; error: string };

/** Post one voucher after the strict double-entry check. Shared by single and batch posting. */
export async function postVoucher(user: SessionUser, id: string): Promise<PostVoucherResult> {
  const voucher = await Voucher.findOne({ _id: id, tenant_id: user.tenant_id });
  if (!voucher) return { ok: false, status: 404, error: "Voucher not found" };
  if (voucher.status === "Posted") return { ok: false, status: 400, error: "Voucher is already posted" };
  if (voucher.status === "Voided") return { ok: false, status: 400, error: "A voided voucher cannot be posted" };

  const balanceError = voucherBalanceError(voucher.entries);
  if (balanceError) return { ok: false, status: 400, error: `Cannot post voucher: ${balanceError}` };
  const { totalDebit, totalCredit } = voucherTotals(voucher.entries);

  voucher.total_debit = totalDebit;
  voucher.total_credit = totalCredit;
  voucher.status = "Posted";
  voucher.updated_by = user.user_id as unknown as typeof voucher.updated_by;
  await voucher.save();

  return { ok: true, voucher };
}
