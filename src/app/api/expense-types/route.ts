import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { ExpenseType } from "@/models";

export async function GET() {
  return withAuth(async (user) => {
    const types = await ExpenseType.find({ tenant_id: user.tenant_id }).sort({ name: 1 }).lean();
    return successResponse({ expense_types: types });
  });
}

export async function POST(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json();
    if (!body.name) return errorResponse("Name is required");

    const expenseType = await ExpenseType.create({
      tenant_id: user.tenant_id,
      name: body.name,
      created_by: user.user_id,
    });

    return successResponse({ expense_type: expenseType }, 201);
  }, ["Owner", "Accountant"]);
}
