import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { postInvoice } from "@/lib/invoicePosting";

// POST /api/invoices/[id]/post - Post a draft invoice
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await params;
    const result = await postInvoice(user, id);
    if (!result.ok) return errorResponse(result.error, result.status);
    return successResponse({ invoice: result.invoice });
  });
}
