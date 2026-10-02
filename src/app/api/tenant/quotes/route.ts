import { NextResponse } from "next/server";
import Tenant from "@/models/Tenant";
import { withTenant } from "@/lib/platform/tenant-guard";
import { readJson, rateLimit } from "@/lib/platform/http";
import { orderTypeFor, quote } from "@/lib/platform/pricing";

// POST /api/tenant/quotes - Price breakdown for renewal / upgrade (server-side pricing only)
export async function POST(req: Request) {
  return withTenant(async (user) => {
    rateLimit(`tenant-quote:${user.user_id}`, 120, 60_000);
    const b = await readJson<{ upgrade?: boolean; seats: number; branches: number; term_quarters: number; promo_code?: string }>(req);
    const agency = await Tenant.findById(user.tenant_id).lean();
    if (!agency) return NextResponse.json({ error: "Agency not found" }, { status: 404 });
    const type = await orderTypeFor(agency, Boolean(b.upgrade));
    const q = await quote({ type, agency, seats: b.seats, branches: b.branches, term_quarters: b.term_quarters, promo_code: b.promo_code });
    return NextResponse.json({ quote: q });
  });
}
