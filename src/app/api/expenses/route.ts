import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { Expense, ExpenseType } from "@/models";
import { logChanges } from "@/lib/audit";

export async function GET(req: NextRequest) {
  return withAuth(async (user) => {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const filter: Record<string, unknown> = { tenant_id: user.tenant_id };
    if (status) filter.status = status;

    const [expenses, total] = await Promise.all([
      Expense.find(filter).populate("expense_type_id", "name").sort({ created_at: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Expense.countDocuments(filter),
    ]);

    return successResponse({ expenses, total, page, pages: Math.ceil(total / limit) });
  });
}

// Expenses post directly; there is no manager-approval step.
export async function POST(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json();
    const { expense_type_id, amount, description } = body;

    if (!expense_type_id || !amount) return errorResponse("expense_type_id and amount are required");

    const expenseType = await ExpenseType.findOne({ _id: expense_type_id, tenant_id: user.tenant_id });
    if (!expenseType) return errorResponse("Expense type not found", 404);

    const expense = await Expense.create({
      tenant_id: user.tenant_id,
      expense_type_id,
      amount,
      description: description || "",
      status: "Posted",
      created_by: user.user_id,
      updated_by: user.user_id,
    });

    await logChanges(
      { tenant_id: user.tenant_id, entity_type: "Expense", entity_id: expense._id, changed_by: user.user_id },
      null,
      expense.toObject()
    );

    return successResponse({ expense }, 201);
  });
}
