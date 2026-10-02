import { NextRequest, NextResponse } from "next/server";
import { CommissionEarner, CommissionPayout } from "@/models/platform";
import { withPlatform, readJson, pagination, listResponse } from "@/lib/platform/http";
import { recordPayout } from "@/lib/platform/commissions";

// GET /api/admin/payouts - Payout history
export async function GET(req: NextRequest) {
  return withPlatform(req, "earners.read", async (ctx) => {
    const url = new URL(req.url);
    const { page, page_size, skip } = pagination(url);
    const filter: Record<string, unknown> = {};
    if (ctx.user.role === "SalesExecutive") {
      const own = await CommissionEarner.findOne({ platform_user_id: ctx.user.id }).select("_id").lean();
      filter.earner_id = own?._id ?? null;
    }
    const [rows, total] = await Promise.all([CommissionPayout.find(filter).sort({ paid_at: -1 }).skip(skip).limit(page_size).lean(), CommissionPayout.countDocuments(filter)]);
    const names = new Map((await CommissionEarner.find({ _id: { $in: rows.map((r) => r.earner_id) } }).select("name").lean()).map((e) => [String(e._id), e.name]));
    return listResponse(rows.map((r) => ({ ...r, earner_name: names.get(String(r.earner_id)) ?? "-" })), page, page_size, total);
  });
}

// POST /api/admin/payouts - Record a manual payout (Super Admin) — allocates unpaid entries oldest first
export async function POST(req: NextRequest) {
  return withPlatform(req, "payouts.write", async (ctx) => {
    const b = await readJson<{ earner_id: string; amount: number; paid_at?: string; method?: string; reference?: string; note?: string }>(req);
    return NextResponse.json(await recordPayout(ctx, b), { status: 201 });
  });
}
