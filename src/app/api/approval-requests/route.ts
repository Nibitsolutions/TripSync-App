import { NextRequest } from "next/server";
import { withAuth, successResponse } from "@/lib/api-helpers";
import { ApprovalRequest, Expense } from "@/models";

// GET /api/approval-requests - List approval requests
export async function GET(req: NextRequest) {
  return withAuth(async (user) => {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // optional filter

    // Credit-limit overrides no longer exist; hide any legacy rows from the queue and history
    const query: Record<string, unknown> = { tenant_id: user.tenant_id, type: { $ne: "CreditLimitOverride" } };
    if (status) {
      query.status = status;
    }

    const requests = await ApprovalRequest.find(query)
      .populate("requested_by", "name email")
      .populate("resolved_by", "name email")
      .sort({ created_at: -1 })
      .lean();

    // Fetch related entity info for each request to show details
    const requestsWithDetails = await Promise.all(
      requests.map(async (request) => {
        let details: Record<string, unknown> | null = null;
        if (request.type === "ExpenseApproval") {
          const expense = await Expense.findById(request.related_entity_id)
            .populate("expense_type_id", "name")
            .lean();
          if (expense) {
            details = {
              amount: expense.amount,
              description: expense.description,
              type_name: (expense.expense_type_id as { name?: string } | null)?.name || "Unknown Type",
            };
          }
        }
        return { ...request, details };
      })
    );

    return successResponse({ approval_requests: requestsWithDetails });
  });
}
