import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { Booking, Invoice, InvoiceLineItem, Tenant } from "@/models";
import { logChanges } from "@/lib/audit";
import { nextInvoiceNumber } from "@/lib/numbering";
import { invoiceTypeOf } from "@/lib/taxCodes";

// POST /api/bookings/[id]/invoice — generate an invoice draft from a confirmed booking
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await params;
    const booking = await Booking.findOne({ _id: id, tenant_id: user.tenant_id });
    if (!booking) return errorResponse("Booking not found", 404);

    if (booking.invoice_id) {
      return errorResponse("This booking has already been billed / invoiced");
    }

    const tenant = await Tenant.findById(user.tenant_id);
    if (!tenant) return errorResponse("Tenant not found", 404);

    // Sequential number per invoice type (TCK-1, HTL-1, …)
    const invoice_number = await nextInvoiceNumber(user.tenant_id, invoiceTypeOf(booking.service_type));

    // Create Invoice
    const invoice = await Invoice.create({
      tenant_id: user.tenant_id,
      customer_id: booking.customer_id,
      invoice_number,
      status: "Draft",
      currency: tenant.base_currency,
      total_amount: booking.total_price,
      booking_reference: booking.booking_reference,
      bsp_flag: false,
      bsp_billing_period: null,
      created_by: user.user_id,
      updated_by: user.user_id,
    });

    // Build description: Passengers + PNR
    const pNames = booking.passenger_details.map((p: { name: string }) => p.name).join(", ");
    const description = `${booking.service_type} booking reference ${booking.booking_reference}` +
      (booking.gds_pnr ? ` (PNR: ${booking.gds_pnr})` : "") +
      (pNames ? `. Passengers: ${pNames}` : "");

    // Create Invoice Line Item
    await InvoiceLineItem.create({
      invoice_id: invoice._id,
      tenant_id: user.tenant_id,
      service_type: booking.service_type,
      description,
      amount: booking.total_price,
      tax_code_id: null,
      booking_reference: booking.booking_reference,
    });

    // Link booking to invoice
    booking.invoice_id = invoice._id;
    await booking.save();

    await logChanges(
      { tenant_id: user.tenant_id, entity_type: "Invoice", entity_id: invoice._id, changed_by: user.user_id },
      null,
      invoice.toObject()
    );

    return successResponse({ invoice, booking });
  });
}