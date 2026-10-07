// Double-entry balance rule shared by voucher create, update and post:
// a voucher can only be saved when total debit equals total credit and is non-zero.

type Entry = { debit?: unknown; credit?: unknown };

export function voucherTotals(entries: Entry[] | undefined) {
  const list = entries || [];
  const totalDebit = list.reduce((s, e) => s + (Number(e.debit) || 0), 0);
  const totalCredit = list.reduce((s, e) => s + (Number(e.credit) || 0), 0);
  return { totalDebit, totalCredit };
}

const fmt = (n: number) => n.toLocaleString("en-PK", { minimumFractionDigits: 2 });

// Returns an error message when the voucher is out of balance, otherwise null.
export function voucherBalanceError(entries: Entry[] | undefined): string | null {
  if (!entries || entries.length === 0) return "Voucher must have at least one entry";
  const { totalDebit, totalCredit } = voucherTotals(entries);
  const diff = Math.abs(totalDebit - totalCredit);
  if (diff > 0.01) {
    return `Debit (PKR ${fmt(totalDebit)}) and Credit (PKR ${fmt(totalCredit)}) must be equal. Difference: PKR ${fmt(diff)}`;
  }
  if (totalDebit <= 0) return "Voucher amount cannot be zero";
  return null;
}
