import { NextResponse } from "next/server";
import { withTenant } from "@/lib/platform/tenant-guard";
import { oid } from "@/lib/platform/http";
import { cancelOrder } from "@/lib/platform/orders";

// POST /api/tenant/orders/[id] - Cancel own pending order (releases any promo redemption)
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withTenant(
    async (user) => {
      const { id } = await params;
      oid(id);
      const order = await cancelOrder(id, user.tenant_id, { kind: "agency", user_id: user.user_id, name: user.name, role: user.role });
      return NextResponse.json({ order });
    },
    { allowWhenExpired: true, ownerOnly: true }
  );
}
