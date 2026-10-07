import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { Voucher } from "@/models";
import { createVoucher } from "@/lib/voucherCreate";

// GET /api/vouchers?type=RV&status=Draft&page=1&limit=20&search=
export async function GET(req: NextRequest) {
  return withAuth(async (user) => {
    const { searchParams } = new URL(req.url);

    const filter: Record<string, unknown> = { tenant_id: user.tenant_id };

    const type = searchParams.get("type");
    if (type && type !== "all") filter.voucher_type = type;

    const status = searchParams.get("status");
    if (status && status !== "all") filter.status = status;

    const search = searchParams.get("search");
    if (search) {
      filter.$or = [
        { voucher_number: { $regex: search, $options: "i" } },
        { name_on_voucher: { $regex: search, $options: "i" } },
        { manual_receipt_no: { $regex: search, $options: "i" } },
      ];
    }

    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    const [vouchers, total] = await Promise.all([
      Voucher.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Voucher.countDocuments(filter),
    ]);

    return successResponse({ vouchers, total, page, totalPages: Math.ceil(total / limit) });
  });
}

// POST /api/vouchers — create new voucher with auto-number
export async function POST(req: NextRequest) {
  return withAuth(async (user) => {
    const result = await createVoucher(user, await req.json());
    if (!result.ok) return errorResponse(result.error, result.status);
    return successResponse({ voucher: result.voucher }, 201);
  });
}
