import { NextRequest, NextResponse } from "next/server";
import Tenant from "@/models/Tenant";
import { withPlatform, readJson, assertAgencyInScope, oid, ApiError } from "@/lib/platform/http";
import { orderTypeFor, quote } from "@/lib/platform/pricing";

// POST /api/admin/pricing/quote - Price breakdown for staff order entry
// body: { agency_id?, upgrade?, seats, branches, term_quarters, promo_code?, manual_adjustment? }
export async function POST(req: NextRequest) {
  return withPlatform(req, ["orders.create", "pricing.read"], async (ctx) => {
    const body = await readJson<{ agency_id?: string; upgrade?: boolean; seats: number; branches: number; term_quarters: number; promo_code?: string; manual_adjustment?: number }>(req);
    let agency = null;
    let type: Awaited<ReturnType<typeof orderTypeFor>> = "NEW";
    if (body.agency_id) {
      await assertAgencyInScope(ctx.user, oid(body.agency_id));
      agency = await Tenant.findById(body.agency_id).lean();
      if (!agency) throw new ApiError(404, "NOT_FOUND", "Agency not found");
      type = await orderTypeFor(agency, Boolean(body.upgrade));
    }
    if (body.manual_adjustment && ctx.user.role !== "SuperAdmin") throw new ApiError(403, "FORBIDDEN", "Only Super Admin can apply a manual adjustment");
    const q = await quote({ type, agency, seats: body.seats, branches: body.branches, term_quarters: body.term_quarters, promo_code: body.promo_code, manual_adjustment: body.manual_adjustment });
    return NextResponse.json({ quote: q });
  });
}
