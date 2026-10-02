import { NextRequest, NextResponse } from "next/server";
import { PriceBook } from "@/models/platform";
import { withPlatform, readJson, ApiError } from "@/lib/platform/http";
import { platformActor, writeAudit } from "@/lib/platform/audit";

// GET /api/admin/price-books - Versioned price books (newest first) with the active one flagged
export async function GET(req: NextRequest) {
  return withPlatform(req, "pricing.read", async (ctx) => {
    if (ctx.user.role === "SalesExecutive") throw new ApiError(403, "FORBIDDEN", "Sales Executives can only request quotes");
    const now = new Date();
    const rows = await PriceBook.find().sort({ effective_from: -1, created_at: -1 }).limit(200).lean();
    const active = rows.find((r) => new Date(r.effective_from) <= now);
    return NextResponse.json({
      data: rows.map((r) => ({
        ...r,
        state: active && String(active._id) === String(r._id) ? "ACTIVE" : new Date(r.effective_from) > now ? "SCHEDULED" : "SUPERSEDED",
      })),
    });
  });
}

// POST /api/admin/price-books - Insert a new immutable price book (immediate or scheduled)
export async function POST(req: NextRequest) {
  return withPlatform(req, "pricing.write", async (ctx) => {
    const b = await readJson<Record<string, unknown>>(req);
    const num = (k: string) => {
      const v = Number(b[k]);
      if (!Number.isFinite(v) || v < 0) throw new ApiError(400, "VALIDATION_ERROR", `${k} must be a non-negative number`);
      return Math.round(v);
    };
    const effective = b.effective_from ? new Date(String(b.effective_from)) : new Date();
    if (isNaN(effective.getTime())) throw new ApiError(400, "VALIDATION_ERROR", "Invalid effective_from");
    const terms = Array.isArray(b.term_options) ? (b.term_options as unknown[]).map(Number).filter((n) => [1, 2, 3, 4].includes(n)) : [1, 2, 3, 4];
    const pb = await PriceBook.create({
      name: String(b.name || `Price book ${effective.toISOString().slice(0, 10)}`).trim(),
      effective_from: effective,
      currency: "PKR",
      base_monthly_fee: num("base_monthly_fee"),
      included_seats: num("included_seats"),
      included_branches: num("included_branches"),
      seat_monthly_rate: num("seat_monthly_rate"),
      branch_monthly_rate: num("branch_monthly_rate"),
      term_options: terms.length ? terms : [1, 2, 3, 4],
      note: String(b.note || ""),
      created_by: ctx.user.id,
    });
    await writeAudit(platformActor(ctx), { action: "pricing.price_book_create", entity_type: "price_book", entity_id: pb._id, after: pb.toObject() });
    return NextResponse.json({ price_book: pb }, { status: 201 });
  });
}
