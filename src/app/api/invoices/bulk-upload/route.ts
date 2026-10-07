import { NextRequest, NextResponse } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { readUploadedXlsx } from "@/lib/bulkUpload/http";
import { UPLOAD_INVOICE_TYPES, UploadInvoiceType } from "@/lib/bulkUpload/invoiceTemplates";
import { processInvoiceUpload, UploadRejected } from "@/lib/bulkUpload/processInvoices";

export const maxDuration = 60;

// POST /api/invoices/bulk-upload (multipart: type, file) — create Draft invoices from a template
export async function POST(req: NextRequest) {
  return withAuth(async (user) => {
    const upload = await readUploadedXlsx(req);
    if (upload instanceof NextResponse) return upload;
    const type = upload.type as UploadInvoiceType;
    if (!UPLOAD_INVOICE_TYPES.includes(type)) return errorResponse("Unknown invoice type");
    try {
      return successResponse(await processInvoiceUpload(user, type, upload.file));
    } catch (err) {
      if (err instanceof UploadRejected) return errorResponse(err.message);
      if (err instanceof Error && /zip|end of data|corrupt|central directory/i.test(err.message)) {
        return errorResponse("The file could not be read as an Excel workbook. Save it as .xlsx and try again.");
      }
      throw err;
    }
  });
}
