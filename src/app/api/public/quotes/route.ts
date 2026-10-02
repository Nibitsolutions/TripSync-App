import { NextResponse } from "next/server";
import { withErrors, readJson, rateLimit, requestMeta } from "@/lib/platform/http";
import { quote } from "@/lib/platform/pricing";

// POST /api/public/quotes - Price breakdown for the purchase form (new customers)
export async function POST(req: Request) {
  return withErrors(async () => {
    rateLimit(`public-quote:${requestMeta(req).ip ?? "unknown"}`, 120, 60_000);
    const b = await readJson<{ seats: number; branches: number; term_quarters: number; promo_code?: string }>(req);
    const q = await quote({ type: "NEW", agency: null, seats: b.seats, branches: b.branches, term_quarters: b.term_quarters, promo_code: b.promo_code });
    return NextResponse.json({ quote: q });
  });
}
