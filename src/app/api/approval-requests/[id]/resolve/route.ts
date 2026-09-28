import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { ApprovalRequest, Expense } from "@/models";
import { logChanges } from "@/lib/audit";

// POST /api/approval-requests/[id]/resolve - Approve or reject
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await params;
    const body = await req.json();
    const { decision } = body; // "approve" | "reject"

    if (!["approve", "reject"].includes(decision)) {
      return errorResponse("Decision must be 'approve' or 'reject'");
    }

    // Legacy credit-limit override rows can no longer be resolved
    const request = await ApprovalRequest.findOne({ _id: id, tenant_id: user.tenant_id, type: { $ne: "CreditLimitOverride" } });
    if (!request) return errorResponse("Approval request not found", 404);
    if (request.status !== "Pending") return errorResponse("Request already resolved");

    const oldDoc = request.toObject();
    request.status = decision === "approve" ? "Approved" : "Rejected";
    request.resolved_by = user.user_id;
    request.resolved_at = new Date();
    await request.save();

    // If expense approval, update expense status
    if (request.type === "ExpenseApproval") {
      const newStatus = decision === "approve" ? "Posted" : "Draft";
      await Expense.findByIdAndUpdate(request.related_entity_id, { status: newStatus });
    }

    await logChanges(
      { tenant_id: user.tenant_id, entity_type: "ApprovalRequest", entity_id: request._id, changed_by: user.user_id },
      oldDoc,
      request.toObject()
    );

    return successResponse({ approval_request: request });
  }, ["Owner", "Accountant"]);
}
