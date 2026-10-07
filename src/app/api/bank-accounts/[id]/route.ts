import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { BankAccount } from "@/models";
import { bankAccountMissingFields, bankAccountPayload, CASH_IN_HAND_KEY } from "@/lib/bankAccounts";

interface Params {
  params: Promise<{ id: string }>;
}

// PATCH /api/bank-accounts/[id] — edit an entry, or { enabled } to switch it on / off.
// There is no delete: an account that is no longer used is disabled instead.
export async function PATCH(req: NextRequest, { params }: Params) {
  return withAuth(async (user) => {
    const { id } = await params;
    const body = await req.json();

    const account = await BankAccount.findOne({ _id: id, tenant_id: user.tenant_id });
    if (!account) return errorResponse("Bank account not found", 404);

    const editingFields = ["kind", "name", "bank_name", "account_title", "account_number", "branch"].some((k) => body[k] !== undefined);
    if (editingFields) {
      const fields = bankAccountPayload({ ...account.toObject(), ...body });
      if (account.system_key === CASH_IN_HAND_KEY && fields.kind !== "Cash") {
        return errorResponse("Cash in Hand must stay a Cash entry; it is used on Cash Deposit vouchers");
      }
      const missing = bankAccountMissingFields(fields);
      if (missing.length) return errorResponse(`Please fill in: ${missing.join(", ")}`);
      account.set(fields);
    }
    if (body.enabled !== undefined) account.enabled = Boolean(body.enabled);
    account.updated_by = user.user_id as unknown as typeof account.updated_by;

    await account.save();
    return successResponse({ bank_account: account });
  }, ["Owner", "Accountant"]);
}
