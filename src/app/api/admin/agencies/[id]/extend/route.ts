import { NextRequest, NextResponse } from "next/server";
import { withPlatform, readJson, requireReason, oid } from "@/lib/platform/http";
import { extendComplimentary } from "@/lib/platform/lifecycle";

// POST /api/admin/agencies/[id]/extend - Complimentary extension (Super Admin, reason required).
// Paid extensions happen only through Orders.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withPlatform(req, "agencies.extend_complimentary", async (ctx) => {
    const { id } = await params;
    oid(id);
    const body = await readJson<{ days?: number; reason?: string }>(req);
    const agency = await extendComplimentary(ctx, id, Number(body.days), requireReason(body.reason));
    return NextResponse.json({ agency, message: `Complimentary extension of ${body.days} days applied` });
  });
}
