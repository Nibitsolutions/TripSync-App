import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { Voucher } from "@/models";
import { postVoucher } from "@/lib/voucherPosting";

const MAX_BATCH = 50;

// POST /api/vouchers/batch-post  { ids }
// Posts each selected voucher exactly as single posting does. Out-of-balance or otherwise
// invalid vouchers are reported and skipped while the rest still post.
export async function POST(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json();
    const ids: string[] = Array.isArray(body.ids) ? [...new Set(body.ids.map(String))] as string[] : [];

    if (ids.length === 0) return errorResponse("Select at least one voucher to post");
    if (ids.length > MAX_BATCH) return errorResponse(`You can post at most ${MAX_BATCH} vouchers at a time`);
    if (ids.some((id) => !mongoose.isValidObjectId(id))) return errorResponse("Invalid voucher selection");

    const vouchers = await Voucher.find({ _id: { $in: ids }, tenant_id: user.tenant_id }).select("_id voucher_number").lean();
    const numberById = new Map(vouchers.map((v) => [String(v._id), v.voucher_number as string]));

    const posted: Array<{ id: string; voucher_number: string }> = [];
    const failed: Array<{ id: string; voucher_number: string; error: string }> = [];

    for (const id of ids) {
      const voucher_number = numberById.get(id) || id;
      const result = await postVoucher(user, id);
      if (result.ok) posted.push({ id, voucher_number });
      else failed.push({ id, voucher_number, error: result.error.replace(/^Cannot post voucher: /, "") });
    }

    return successResponse({ posted, failed });
  });
}
