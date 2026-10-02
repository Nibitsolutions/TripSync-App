import { NextRequest, NextResponse } from "next/server";
import { Campaign, CommissionEarner, Order, PromoCode } from "@/models/platform";
import { withPlatform, readJson, ApiError, toCsv, csvResponse, escapeRegex } from "@/lib/platform/http";
import { campaignState } from "@/lib/platform/pricing";
import { platformActor, writeAudit } from "@/lib/platform/audit";
import { formatPKT } from "@/lib/platform/db";
import { ORDER_TYPES, OrderType } from "@/models/platform";

function summary(type: string, value: number, scope: string) {
  return `${type === "PERCENT" ? `${value}%` : `PKR ${value.toLocaleString("en-PK")}`} off — ${scope}`;
}

// GET /api/admin/promotions - Unified campaigns + promo codes list (never deleted), filters, CSV
export async function GET(req: NextRequest) {
  return withPlatform(req, "pricing.read", async (ctx) => {
    if (ctx.user.role === "SalesExecutive") throw new ApiError(403, "FORBIDDEN", "Sales Executives can only request quotes");
    const sp = new URL(req.url).searchParams;
    const now = new Date();
    const [campaigns, codes] = await Promise.all([Campaign.find().sort({ created_at: -1 }).lean(), PromoCode.find().sort({ created_at: -1 }).lean()]);
    const usage = new Map(
      (
        await Order.aggregate([
          { $match: { status: { $in: ["PENDING", "APPROVED"] } } },
          { $group: { _id: { c: "$campaign_id", p: "$promo_code_id" }, n: { $sum: 1 } } },
        ])
      ).flatMap((u) => [
        [`c:${u._id.c}`, u.n],
        [`p:${u._id.p}`, u.n],
      ])
    );
    // Campaign usage needs summing across promo groups.
    const campUsage = new Map<string, number>();
    const promoUsage = new Map<string, number>();
    for (const [k, n] of usage) {
      if (k.startsWith("c:")) campUsage.set(k.slice(2), (campUsage.get(k.slice(2)) ?? 0) + (n as number));
      if (k.startsWith("p:")) promoUsage.set(k.slice(2), (promoUsage.get(k.slice(2)) ?? 0) + (n as number));
    }
    const earners = new Map((await CommissionEarner.find().select("name type").lean()).map((e) => [String(e._id), e]));
    let rows = [
      ...campaigns.map((c) => ({
        id: String(c._id),
        kind: "CAMPAIGN",
        method: "AUTOMATIC",
        title: c.name,
        summary: summary(c.discount_type, c.value, (c.applies_to_order_types || []).join(", ").toLowerCase() || "all orders"),
        status: campaignState(c, now),
        discount_type: c.discount_type,
        value: c.value,
        eligibility: (c.applies_to_order_types || []).join(", "),
        usage: campUsage.get(String(c._id)) ?? 0,
        max_redemptions: null as number | null,
        starts_at: c.starts_at,
        ends_at: c.ends_at,
        owner: null as string | null,
        owner_type: null as string | null,
        description: c.description,
        first_order_only: false,
        one_per_agency: false,
        applies_to_order_types: c.applies_to_order_types,
        created_at: c.created_at,
      })),
      ...codes.map((p) => ({
        id: String(p._id),
        kind: "PROMO_CODE",
        method: "CODE",
        title: p.code,
        summary: summary(p.discount_type, p.value, p.first_order_only ? "first order only" : "all orders"),
        status: campaignState(p, now),
        discount_type: p.discount_type,
        value: p.value,
        eligibility: [p.first_order_only && "First order only", p.one_per_agency && "Once per agency"].filter(Boolean).join(", ") || "Any order",
        usage: promoUsage.get(String(p._id)) ?? 0,
        max_redemptions: p.max_redemptions,
        starts_at: p.starts_at,
        ends_at: p.ends_at,
        owner: p.owner_earner_id ? earners.get(String(p.owner_earner_id))?.name ?? null : null,
        owner_type: p.owner_earner_id ? earners.get(String(p.owner_earner_id))?.type ?? null : null,
        owner_earner_id: p.owner_earner_id ? String(p.owner_earner_id) : null,
        description: "",
        first_order_only: p.first_order_only,
        one_per_agency: p.one_per_agency,
        applies_to_order_types: null,
        created_at: p.created_at,
      })),
    ];
    const kind = sp.get("kind");
    if (kind) rows = rows.filter((r) => r.kind === kind);
    const status = sp.get("status");
    if (status) rows = rows.filter((r) => r.status === status);
    const q = (sp.get("q") || "").trim();
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      rows = rows.filter((r) => rx.test(r.title) || rx.test(r.summary) || rx.test(r.owner || ""));
    }
    rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (sp.get("format") === "csv") {
      return csvResponse(
        "promotions.csv",
        toCsv(
          rows.map((r) => ({ ...r, starts_at: formatPKT(r.starts_at), ends_at: r.ends_at ? formatPKT(r.ends_at) : "" })),
          ["kind", "title", "summary", "status", "method", "discount_type", "value", "eligibility", "usage", "max_redemptions", "starts_at", "ends_at", "owner"]
        )
      );
    }
    return NextResponse.json({ data: rows, total: rows.length });
  });
}

// POST /api/admin/promotions - Create a campaign ({kind:"CAMPAIGN"}) or promo code ({kind:"PROMO_CODE"})
export async function POST(req: NextRequest) {
  return withPlatform(req, "pricing.write", async (ctx) => {
    const b = await readJson<Record<string, unknown>>(req);
    const discount_type: "FLAT" | "PERCENT" = b.discount_type === "FLAT" ? "FLAT" : "PERCENT";
    const value = Number(b.value);
    if (!Number.isFinite(value) || value <= 0) throw new ApiError(400, "VALIDATION_ERROR", "Value must be positive");
    if (discount_type === "PERCENT" && value > 100) throw new ApiError(400, "VALIDATION_ERROR", "Percent cannot exceed 100");
    const starts_at = b.starts_at ? new Date(String(b.starts_at)) : new Date();
    const ends_at = b.ends_at ? new Date(String(b.ends_at)) : null;
    if (ends_at && ends_at <= starts_at) throw new ApiError(400, "VALIDATION_ERROR", "End must be after start");

    if (b.kind === "CAMPAIGN") {
      const types = Array.isArray(b.applies_to_order_types)
        ? ((b.applies_to_order_types as string[]).filter((t) => (ORDER_TYPES as readonly string[]).includes(t)) as OrderType[])
        : (["NEW", "CONVERSION", "RENEWAL", "REACTIVATION"] as OrderType[]);
      const name = String(b.name || "").trim();
      if (!name) throw new ApiError(400, "VALIDATION_ERROR", "Campaign name is required");
      const c = await Campaign.create({ name, description: String(b.description || ""), discount_type, value, applies_to_order_types: types, starts_at, ends_at, created_by: ctx.user.id });
      await writeAudit(platformActor(ctx), { action: "pricing.campaign_create", entity_type: "campaign", entity_id: c._id, after: c.toObject() });
      return NextResponse.json({ campaign: c }, { status: 201 });
    }

    const code = String(b.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4,20}$/.test(code)) throw new ApiError(400, "VALIDATION_ERROR", "Code must be 4–20 letters/digits");
    if (await PromoCode.exists({ code })) throw new ApiError(409, "DUPLICATE", "This code already exists");
    const p = await PromoCode.create({
      code,
      owner_earner_id: (b.owner_earner_id as string) || null,
      discount_type,
      value,
      first_order_only: Boolean(b.first_order_only),
      starts_at,
      ends_at,
      max_redemptions: b.max_redemptions ? Math.max(1, Math.floor(Number(b.max_redemptions))) : null,
      one_per_agency: b.one_per_agency !== false,
      created_by: ctx.user.id,
    });
    await writeAudit(platformActor(ctx), { action: "pricing.promo_create", entity_type: "promo_code", entity_id: p._id, after: p.toObject() });
    return NextResponse.json({ promo_code: p }, { status: 201 });
  });
}
