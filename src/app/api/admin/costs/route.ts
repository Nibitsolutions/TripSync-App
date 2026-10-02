import { NextRequest, NextResponse } from "next/server";
import { CommissionPayout, COST_CATEGORIES, PlatformCost } from "@/models/platform";
import { withPlatform, readJson, pagination, listResponse, ApiError, toCsv, csvResponse } from "@/lib/platform/http";
import { platformActor, writeAudit } from "@/lib/platform/audit";
import { formatPKT, roundHalfUp } from "@/lib/platform/db";

// GET /api/admin/costs - Manual cost entries (+ commission payouts summarised separately)
export async function GET(req: NextRequest) {
  return withPlatform(req, "costs.read", async () => {
    const url = new URL(req.url);
    const sp = url.searchParams;
    const filter: Record<string, unknown> = {};
    if (sp.get("category")) filter.category = sp.get("category");
    if (sp.get("include_void") !== "1") filter.voided_at = null;
    const from = sp.get("from");
    const to = sp.get("to");
    const range: Record<string, Date> = {};
    if (from) range.$gte = new Date(from);
    if (to) range.$lte = new Date(`${to}T23:59:59.999Z`);
    if (from || to) filter.cost_date = range;
    if (sp.get("format") === "csv") {
      const rows = await PlatformCost.find(filter).sort({ cost_date: -1 }).limit(10_000).lean();
      return csvResponse("costs.csv", toCsv(rows.map((r) => ({ ...r, cost_date: formatPKT(r.cost_date), voided_at: r.voided_at ? formatPKT(r.voided_at) : "" })), ["cost_date", "category", "description", "amount", "is_recurring_monthly", "voided_at", "void_reason"]));
    }
    const { page, page_size, skip } = pagination(url);
    const [rows, total, sums, payouts] = await Promise.all([
      PlatformCost.find(filter).sort({ cost_date: -1 }).skip(skip).limit(page_size).lean(),
      PlatformCost.countDocuments(filter),
      PlatformCost.aggregate([{ $match: { ...filter, voided_at: null } }, { $group: { _id: "$category", total: { $sum: "$amount" } } }]),
      CommissionPayout.aggregate([{ $match: from || to ? { paid_at: range } : {} }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    ]);
    return listResponse(rows, page, page_size, total, {
      by_category: Object.fromEntries(sums.map((s) => [s._id, s.total])),
      commission_payouts: payouts[0]?.total ?? 0,
    });
  });
}

// POST /api/admin/costs - Add a cost (optionally recurring monthly)
export async function POST(req: NextRequest) {
  return withPlatform(req, "costs.write", async (ctx) => {
    const b = await readJson<Record<string, unknown>>(req);
    if (!(COST_CATEGORIES as readonly string[]).includes(String(b.category))) throw new ApiError(400, "VALIDATION_ERROR", "Invalid category");
    const amount = roundHalfUp(Number(b.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(400, "VALIDATION_ERROR", "Amount must be positive");
    const date = b.cost_date ? new Date(String(b.cost_date)) : new Date();
    if (isNaN(date.getTime())) throw new ApiError(400, "VALIDATION_ERROR", "Invalid date");
    const cost = await PlatformCost.create({
      cost_date: date,
      category: b.category as (typeof COST_CATEGORIES)[number],
      description: String(b.description || ""),
      amount,
      is_recurring_monthly: Boolean(b.is_recurring_monthly),
      recurring_ends_on: b.recurring_ends_on ? new Date(String(b.recurring_ends_on)) : null,
      created_by: ctx.user.id,
    });
    await writeAudit(platformActor(ctx), { action: "cost.create", entity_type: "platform_cost", entity_id: cost._id, after: cost.toObject() });
    return NextResponse.json({ cost }, { status: 201 });
  });
}
