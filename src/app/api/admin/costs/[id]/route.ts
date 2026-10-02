import { NextRequest, NextResponse } from "next/server";
import { COST_CATEGORIES, PlatformCost } from "@/models/platform";
import { withPlatform, readJson, ApiError, oid, requireReason } from "@/lib/platform/http";
import { platformActor, writeAudit } from "@/lib/platform/audit";
import { roundHalfUp } from "@/lib/platform/db";

// PATCH /api/admin/costs/[id] - Edit a cost (not voided)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withPlatform(req, "costs.write", async (ctx) => {
    const { id } = await params;
    const cost = await PlatformCost.findById(oid(id));
    if (!cost) throw new ApiError(404, "NOT_FOUND", "Cost not found");
    if (cost.voided_at) throw new ApiError(409, "LOCKED", "Voided costs cannot be edited");
    const b = await readJson<Record<string, unknown>>(req);
    const before = cost.toObject();
    if (b.category !== undefined) {
      if (!(COST_CATEGORIES as readonly string[]).includes(String(b.category))) throw new ApiError(400, "VALIDATION_ERROR", "Invalid category");
      cost.category = b.category as typeof cost.category;
    }
    if (b.amount !== undefined) {
      const amount = roundHalfUp(Number(b.amount));
      if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(400, "VALIDATION_ERROR", "Amount must be positive");
      cost.amount = amount;
    }
    if (b.description !== undefined) cost.description = String(b.description);
    if (b.cost_date) cost.cost_date = new Date(String(b.cost_date));
    if (b.is_recurring_monthly !== undefined && !cost.recurring_parent_id) cost.is_recurring_monthly = Boolean(b.is_recurring_monthly);
    if (b.recurring_ends_on !== undefined) cost.recurring_ends_on = b.recurring_ends_on ? new Date(String(b.recurring_ends_on)) : null;
    await cost.save();
    await writeAudit(platformActor(ctx), { action: "cost.edit", entity_type: "platform_cost", entity_id: cost._id, before, after: cost.toObject() });
    return NextResponse.json({ cost });
  });
}

// POST /api/admin/costs/[id] - Void (entries are voided, never deleted). body: { reason }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withPlatform(req, "costs.write", async (ctx) => {
    const { id } = await params;
    const b = await readJson<{ reason?: string }>(req);
    const reason = requireReason(b.reason);
    const cost = await PlatformCost.findOneAndUpdate({ _id: oid(id), voided_at: null }, { $set: { voided_at: new Date(), void_reason: reason, is_recurring_monthly: false } }, { returnDocument: "after" });
    if (!cost) throw new ApiError(409, "INVALID_STATE", "Cost not found or already voided");
    await writeAudit(platformActor(ctx), { action: "cost.void", entity_type: "platform_cost", entity_id: cost._id, after: { amount: cost.amount }, reason });
    return NextResponse.json({ cost });
  });
}
