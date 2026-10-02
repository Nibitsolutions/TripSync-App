import { NextResponse } from "next/server";
import { Order } from "@/models/platform";
import { withErrors, rateLimit, requestMeta } from "@/lib/platform/http";

// GET /api/public/orders/[reference]/status - Minimal status for the customer (status only)
export async function GET(req: Request, { params }: { params: Promise<{ reference: string }> }) {
  return withErrors(async () => {
    rateLimit(`public-status:${requestMeta(req).ip ?? "unknown"}`, 60, 60_000);
    const { reference } = await params;
    const order = await Order.findOne({ payment_reference: String(reference).toUpperCase() }).select("status").lean();
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ status: order.status });
  });
}
