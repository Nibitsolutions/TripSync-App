import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { postVoucher } from "@/lib/voucherPosting";

// POST /api/vouchers/[id]/post — change status to Posted
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await params;
    const result = await postVoucher(user, id);
    if (!result.ok) return errorResponse(result.error, result.status);
    return successResponse({ voucher: result.voucher });
  });
}
