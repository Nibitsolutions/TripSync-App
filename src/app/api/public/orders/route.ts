import { NextResponse } from "next/server";
import { withErrors, readJson, requestMeta, ApiError } from "@/lib/platform/http";
import { createOrder } from "@/lib/platform/orders";
import { assertDeliverableEmail, guardPublicForm } from "@/lib/platform/public";
import { getSetting } from "@/lib/platform/settings";

// POST /api/public/orders - Purchase form: agency PENDING (no login yet) + order PENDING
export async function POST(req: Request) {
  return withErrors(async () => {
    const meta = requestMeta(req);
    const b = await readJson<Record<string, unknown>>(req);
    await guardPublicForm(meta, b, "order");
    if (b.data_consent !== true) throw new ApiError(400, "CONSENT_REQUIRED", "Please accept the data processing terms to continue");
    const owner_email = await assertDeliverableEmail(String(b.owner_email || ""));
    const result = await createOrder(
      { kind: "public", meta },
      {
        new_agency: {
          business_name: String(b.business_name || ""),
          owner_name: String(b.owner_name || ""),
          owner_email,
          owner_phone: String(b.owner_phone || ""),
          business_phone: String(b.business_phone || ""),
          business_email: String(b.business_email || ""),
          business_address: String(b.business_address || ""),
          data_consent: true,
          marketing_consent: b.marketing_consent === true,
        },
        seats: Number(b.seats),
        branches: Number(b.branches),
        term_quarters: Number(b.term_quarters),
        promo_code: (b.promo_code as string) || null,
      }
    );
    const order = result.order;
    const support = await getSetting("support_contact");
    const wa = (support.whatsapp || "").replace(/[^\d]/g, "");
    const text = `Payment for TripSync order ${order.order_number}\nReference: ${order.payment_reference}\nBusiness: ${String(b.business_name || "")}\nAmount: PKR ${order.total_due.toLocaleString("en-PK")}`;
    return NextResponse.json(
      {
        order_number: order.order_number,
        payment_reference: order.payment_reference,
        total_due: order.total_due,
        lines: order.lines,
        whatsapp_link: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(text)}` : null,
      },
      { status: 201 }
    );
  });
}
