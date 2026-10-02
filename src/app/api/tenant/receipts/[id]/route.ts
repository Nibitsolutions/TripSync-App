import { NextResponse } from "next/server";
import { Receipt } from "@/models/platform";
import { withTenant } from "@/lib/platform/tenant-guard";
import { oid } from "@/lib/platform/http";
import { getSetting } from "@/lib/platform/settings";

// GET /api/tenant/receipts/[id] - Own receipt (scoped by the token's agency)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withTenant(async (user) => {
    const { id } = await params;
    const receipt = await Receipt.findOne({ _id: oid(id), agency_id: user.tenant_id }).lean();
    if (!receipt) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    return NextResponse.json({ receipt, seller: await getSetting("receipt_tax") });
  });
}
