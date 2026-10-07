import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-helpers";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function xlsxResponse(buffer: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Read the uploaded .xlsx from multipart form data; returns an error response when unusable. */
export async function readUploadedXlsx(req: NextRequest): Promise<{ type: string; file: ArrayBuffer } | NextResponse> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse("Upload a spreadsheet file (.xlsx)");
  }
  const type = String(form.get("type") || "");
  const file = form.get("file");
  if (!(file instanceof File)) return errorResponse("Choose a spreadsheet file (.xlsx) to upload");
  if (!file.name.toLowerCase().endsWith(".xlsx")) return errorResponse("Only Excel .xlsx files can be uploaded");
  if (file.size > MAX_FILE_BYTES) return errorResponse("The file is larger than 5 MB");
  return { type, file: await file.arrayBuffer() };
}
