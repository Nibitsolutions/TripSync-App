import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import User from "@/models/User";
import { CommissionEarner, PromoCode } from "@/models/platform";
import { withPlatform, readJson, ApiError } from "@/lib/platform/http";
import { earnerBalances, earnerPerformance } from "@/lib/platform/commissions";
import { platformActor, writeAudit } from "@/lib/platform/audit";
import { withTxn, sessionOpt } from "@/lib/platform/db";

// GET /api/admin/earners - Sales team + affiliates with performance and commission balances
export async function GET(req: NextRequest) {
  return withPlatform(req, "earners.read", async (ctx) => {
    const sp = new URL(req.url).searchParams;
    const filter: Record<string, unknown> = {};
    if (ctx.user.role === "SalesExecutive") filter.platform_user_id = new Types.ObjectId(ctx.user.id);
    const type = sp.get("type");
    if (type) filter.type = type;
    if (sp.get("active") === "1") filter.is_active = true;
    const earners = await CommissionEarner.find(filter).sort({ type: 1, name: 1 }).lean();
    const ids = earners.map((e) => e._id as Types.ObjectId);
    const [balances, { perf, codes }] = await Promise.all([earnerBalances(ids), earnerPerformance(ids)]);
    return NextResponse.json({
      data: earners.map((e) => ({
        ...e,
        codes: codes.get(String(e._id)) ?? [],
        performance: perf.get(String(e._id)) ?? { orders: 0, revenue: 0, discount: 0 },
        balance: balances.get(String(e._id)) ?? { accrued: 0, reversed: 0, paid: 0, outstanding: 0 },
      })),
    });
  });
}

// POST /api/admin/earners - Add an affiliate (UGC creator) with commission terms and first promo code
export async function POST(req: NextRequest) {
  return withPlatform(req, "earners.write", async (ctx) => {
    const b = await readJson<Record<string, unknown>>(req);
    const name = String(b.name || "").trim();
    if (!name) throw new ApiError(400, "VALIDATION_ERROR", "Name is required");
    const pct = Number(b.commission_percent ?? 0);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new ApiError(400, "VALIDATION_ERROR", "Commission percent must be 0–100");
    const type = b.type === "SALES_EXECUTIVE" ? "SALES_EXECUTIVE" : "AFFILIATE";
    if (type === "SALES_EXECUTIVE") {
      if (!b.platform_user_id) throw new ApiError(400, "VALIDATION_ERROR", "Select the Sales Executive user");
      const u = await User.findOne({ _id: b.platform_user_id, role: "SalesExecutive" }).lean();
      if (!u) throw new ApiError(400, "VALIDATION_ERROR", "User is not a Sales Executive");
    }
    const promo = (b.promo || null) as Record<string, unknown> | null;
    const code = promo?.code ? String(promo.code).trim().toUpperCase() : "";
    if (code && !/^[A-Z0-9]{4,20}$/.test(code)) throw new ApiError(400, "VALIDATION_ERROR", "Code must be 4–20 letters/digits");
    if (code && (await PromoCode.exists({ code }))) throw new ApiError(409, "DUPLICATE", "This promo code already exists");

    const result = await withTxn(async (session) => {
      const [earner] = await CommissionEarner.create(
        [{
          type: type as "SALES_EXECUTIVE" | "AFFILIATE",
          platform_user_id: type === "SALES_EXECUTIVE" ? (b.platform_user_id as string) : null,
          name,
          phone: String(b.phone || ""),
          email: String(b.email || ""),
          commission_percent: pct,
          commission_scope: (b.commission_scope === "ALL_PAYMENTS" ? "ALL_PAYMENTS" : "FIRST_PAYMENT_ONLY") as "ALL_PAYMENTS" | "FIRST_PAYMENT_ONLY",
          notes: String(b.notes || ""),
          created_by: ctx.user.id,
        }],
        sessionOpt(session)
      );
      let promoDoc = null;
      if (code) {
        const value = Number(promo!.value);
        const dt: "FLAT" | "PERCENT" = promo!.discount_type === "FLAT" ? "FLAT" : "PERCENT";
        if (!Number.isFinite(value) || value <= 0 || (dt === "PERCENT" && value > 100)) throw new ApiError(400, "VALIDATION_ERROR", "Invalid promo discount value");
        [promoDoc] = await PromoCode.create(
          [{
            code,
            owner_earner_id: earner._id,
            discount_type: dt,
            value,
            first_order_only: Boolean(promo!.first_order_only),
            starts_at: promo!.starts_at ? new Date(String(promo!.starts_at)) : new Date(),
            ends_at: promo!.ends_at ? new Date(String(promo!.ends_at)) : null,
            max_redemptions: promo!.max_redemptions ? Math.max(1, Math.floor(Number(promo!.max_redemptions))) : null,
            one_per_agency: promo!.one_per_agency !== false,
            created_by: ctx.user.id,
          }],
          sessionOpt(session)
        );
      }
      await writeAudit(platformActor(ctx), { action: "earner.create", entity_type: "commission_earner", entity_id: earner._id, after: { earner: earner.toObject(), promo: promoDoc?.toObject() ?? null } }, session);
      return { earner, promo_code: promoDoc };
    });
    return NextResponse.json(result, { status: 201 });
  });
}
