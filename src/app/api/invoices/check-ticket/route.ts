import { NextRequest } from "next/server";
import { withAuth, successResponse } from "@/lib/api-helpers";
import { Invoice, InvoiceLineItem } from "@/models";

export async function GET(req: NextRequest) {
  return withAuth(async (user) => {
    const { searchParams } = new URL(req.url);
    const ticket_number = searchParams.get("ticket_number")?.trim();
    const exclude_invoice_id = searchParams.get("exclude_invoice_id");

    if (!ticket_number) {
      return successResponse({ exists: false });
    }

    const lineQuery: Record<string, unknown> = {
      tenant_id: user.tenant_id,
      ticket_number,
    };
    if (exclude_invoice_id) {
      lineQuery.invoice_id = { $ne: exclude_invoice_id };
    }

    const matchingLines = await InvoiceLineItem.find(lineQuery).select("invoice_id").lean();
    if (matchingLines.length === 0) {
      return successResponse({ exists: false });
    }

    const invIds = matchingLines.map((l) => l.invoice_id);
    const existingInv = await Invoice.findOne({
      _id: { $in: invIds },
      tenant_id: user.tenant_id,
      status: { $ne: "Voided" },
    }).select("invoice_number").lean();

    if (existingInv) {
      return successResponse({ exists: true, invoice_number: existingInv.invoice_number });
    }

    return successResponse({ exists: false });
  });
}
