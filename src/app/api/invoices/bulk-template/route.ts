import { NextRequest } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-helpers";
import { buildTemplate } from "@/lib/bulkUpload/xlsx";
import { xlsxResponse } from "@/lib/bulkUpload/http";
import { INVOICE_TEMPLATE_COLUMNS, UPLOAD_INVOICE_TYPES, UPLOAD_TYPE_LABELS, UploadInvoiceType } from "@/lib/bulkUpload/invoiceTemplates";

// GET /api/invoices/bulk-template?type=Ticket — the upload template for one invoice type
export async function GET(req: NextRequest) {
  return withAuth(async () => {
    const type = req.nextUrl.searchParams.get("type") as UploadInvoiceType;
    if (!UPLOAD_INVOICE_TYPES.includes(type)) return errorResponse("Unknown invoice type");
    const label = UPLOAD_TYPE_LABELS[type];
    const buffer = await buildTemplate({
      kind: "invoice",
      type,
      title: `${label} invoices`,
      columns: INVOICE_TEMPLATE_COLUMNS[type],
      groupKey: "invoice_ref",
      groupLabel: "Invoice Ref",
    });
    return xlsxResponse(buffer, `TripSync-${label}-Invoices-Template.xlsx`);
  });
}
