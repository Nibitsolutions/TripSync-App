// Shared rules for the agency's Bank / Cash list (Agency Settings → Banks), used by the
// settings screen, the voucher Bank / Source dropdown and the bank-account API.

export type BankAccountKind = "Bank" | "Cash";

export interface BankAccountFields {
  kind: BankAccountKind;
  bank_name?: string;
  account_title?: string;
  account_number?: string;
  branch?: string;
  name?: string;
}

export interface BankAccountRecord extends BankAccountFields {
  _id: string;
  enabled: boolean;
  system_key?: string | null;
}

export const CASH_IN_HAND_KEY = "cash_in_hand";

/** Dropdown / voucher text: "Bank - Account Number (Title)" for banks, just the name for cash. */
export function bankAccountLabel(a: BankAccountFields): string {
  if (a.kind === "Cash") return String(a.name || "").trim();
  const bank = String(a.bank_name || "").trim();
  const number = String(a.account_number || "").trim();
  const title = String(a.account_title || "").trim();
  return `${bank} - ${number}${title ? ` (${title})` : ""}`;
}

/** Pick the fields that apply to the entry's kind from a request body; the other kind's are cleared. */
export function bankAccountPayload(body: Record<string, unknown>): Required<BankAccountFields> {
  const kind: BankAccountKind = body.kind === "Cash" ? "Cash" : "Bank";
  const str = (v: unknown) => String(v ?? "").trim();
  return kind === "Cash"
    ? { kind, name: str(body.name), bank_name: "", account_title: "", account_number: "", branch: "" }
    : {
        kind,
        name: "",
        bank_name: str(body.bank_name),
        account_title: str(body.account_title),
        account_number: str(body.account_number),
        branch: str(body.branch),
      };
}

/** Names of required fields that are empty: a Bank needs all four, a Cash entry only its name. */
export function bankAccountMissingFields(a: BankAccountFields): string[] {
  const blank = (v?: string) => !String(v || "").trim();
  if (a.kind === "Cash") return blank(a.name) ? ["Name"] : [];
  const missing: string[] = [];
  if (blank(a.bank_name)) missing.push("Bank Name");
  if (blank(a.account_title)) missing.push("Account Title");
  if (blank(a.account_number)) missing.push("Account Number");
  if (blank(a.branch)) missing.push("Branch");
  return missing;
}
