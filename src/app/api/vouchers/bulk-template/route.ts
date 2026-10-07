import { NextRequest } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-helpers";
import { buildTemplate } from "@/lib/bulkUpload/xlsx";
import { xlsxResponse } from "@/lib/bulkUpload/http";
import { UPLOAD_VOUCHER_TYPES, UploadVoucherType, VOUCHER_TEMPLATE_COLUMNS, VOUCHER_TYPE_LABELS } from "@/lib/bulkUpload/voucherTemplates";

// GET /api/vouchers/bulk-template?type=RV — the upload template for one voucher type
export async function GET(req: NextRequest) {
  return withAuth(async () => {
    const type = req.nextUrl.searchParams.get("type") as UploadVoucherType;
    if (!UPLOAD_VOUCHER_TYPES.includes(type)) return errorResponse("Unknown voucher type");
    const buffer = await buildTemplate({
      kind: "voucher",
      type,
      title: `${VOUCHER_TYPE_LABELS[type]}s`,
      columns: VOUCHER_TEMPLATE_COLUMNS[type],
      groupKey: "voucher_ref",
      groupLabel: "Voucher Ref",
    });
    return xlsxResponse(buffer, `TripSync-${type}-Vouchers-Template.xlsx`);
  });
}
