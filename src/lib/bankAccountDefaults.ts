import { Types } from "mongoose";
import { BankAccount, Tenant } from "@/models";
import { CASH_IN_HAND_KEY } from "./bankAccounts";

// Agencies that existed while the bank list was still hard-coded get those banks as normal,
// editable entries; agencies created after that start with only Cash in Hand.
const BANK_LIST_RELEASED_AT = new Date("2026-10-08T00:00:00+05:00");

const LEGACY_ENTRIES = [
  { kind: "Bank", bank_name: "MBL", account_number: "0101-0102030", account_title: "Operating", branch: "Main Branch" },
  { kind: "Bank", bank_name: "HBL", account_number: "2341-998201", account_title: "Main Branch", branch: "Main Branch" },
  { kind: "Bank", bank_name: "UBL", account_number: "1102-887410", account_title: "Corporate", branch: "Main Branch" },
  { kind: "Bank", bank_name: "MCB", account_number: "5560-120934", account_title: "Collection", branch: "Main Branch" },
  { kind: "Bank", bank_name: "BAFL", account_number: "8890-001243", account_title: "Operations", branch: "Main Branch" },
  { kind: "Bank", bank_name: "SCB", account_number: "0122-998765", account_title: "Treasury", branch: "Main Branch" },
  { kind: "Bank", bank_name: "ABL", account_number: "4432-119902", account_title: "Clearing", branch: "Main Branch" },
  { kind: "Cash", name: "Petty Cash" },
] as const;

/**
 * Make sure the agency's bank list is initialised: legacy banks for pre-existing agencies,
 * and a Cash in Hand entry for everyone (Cash Deposit vouchers pre-fill it).
 */
export async function ensureBankAccounts(tenantId: string) {
  const tenant_id = new Types.ObjectId(tenantId);
  const count = await BankAccount.countDocuments({ tenant_id });

  if (count === 0) {
    const tenant = await Tenant.findById(tenant_id).select("created_at").lean<{ created_at?: Date }>();
    if (tenant?.created_at && tenant.created_at < BANK_LIST_RELEASED_AT) {
      await BankAccount.insertMany(LEGACY_ENTRIES.map((e) => ({ ...e, tenant_id })));
    }
  }

  const hasCashInHand = await BankAccount.exists({ tenant_id, system_key: CASH_IN_HAND_KEY });
  if (!hasCashInHand) {
    try {
      await BankAccount.create({ tenant_id, kind: "Cash", name: "Cash in Hand", system_key: CASH_IN_HAND_KEY });
    } catch (err) {
      // A parallel request created it first
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }
}
