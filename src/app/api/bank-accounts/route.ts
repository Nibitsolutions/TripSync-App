import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { BankAccount } from "@/models";
import { ensureBankAccounts } from "@/lib/bankAccountDefaults";
import { bankAccountMissingFields, bankAccountPayload } from "@/lib/bankAccounts";

const MANAGERS = ["Owner", "Accountant"];

// GET /api/bank-accounts?enabled=1 — the agency's Bank / Cash list (enabled only with ?enabled=1)
export async function GET(req: NextRequest) {
  return withAuth(async (user) => {
    await ensureBankAccounts(user.tenant_id);
    const filter: Record<string, unknown> = { tenant_id: user.tenant_id };
    if (req.nextUrl.searchParams.get("enabled") === "1") filter.enabled = true;
    const accounts = await BankAccount.find(filter).sort({ kind: 1, created_at: 1 }).lean();
    return successResponse({ bank_accounts: accounts });
  });
}

// POST /api/bank-accounts — add a Bank or Cash entry (Owner / Accountant)
export async function POST(req: NextRequest) {
  return withAuth(async (user) => {
    const fields = bankAccountPayload(await req.json());
    const missing = bankAccountMissingFields(fields);
    if (missing.length) return errorResponse(`Please fill in: ${missing.join(", ")}`);

    const account = await BankAccount.create({
      ...fields,
      tenant_id: user.tenant_id,
      enabled: true,
      created_by: user.user_id,
      updated_by: user.user_id,
    });
    return successResponse({ bank_account: account }, 201);
  }, MANAGERS);
}
