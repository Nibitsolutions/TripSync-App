import { NextRequest, NextResponse } from "next/server";
import { MaintenanceWindow } from "@/models/platform";
import { withPlatform, readJson, ApiError, oid, requireReason } from "@/lib/platform/http";
import { findOverlap, invalidateMaintenance, maintenanceState } from "@/lib/platform/maintenance";
import { platformActor, writeAudit } from "@/lib/platform/audit";

// PATCH /api/admin/maintenance/[id] - Edit while SCHEDULED
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withPlatform(req, "maintenance.write", async (ctx) => {
    const { id } = await params;
    const w = await MaintenanceWindow.findById(oid(id));
    if (!w) throw new ApiError(404, "NOT_FOUND", "Window not found");
    if (maintenanceState(w) !== "SCHEDULED") throw new ApiError(409, "LOCKED", "Only scheduled windows can be edited");
    const b = await readJson<Record<string, unknown>>(req);
    const before = w.toObject();
    if (b.title !== undefined) w.title = String(b.title).trim() || w.title;
    if (b.reason_message !== undefined) w.reason_message = String(b.reason_message);
    if (b.starts_at) w.starts_at = new Date(String(b.starts_at));
    if (b.ends_at) w.ends_at = new Date(String(b.ends_at));
    if (b.notify_in_app_from) w.notify_in_app_from = new Date(String(b.notify_in_app_from));
    if (w.ends_at <= w.starts_at) throw new ApiError(400, "VALIDATION_ERROR", "End must be after start");
    let reason: string | null = null;
    if (w.ends_at.getTime() - w.starts_at.getTime() > 24 * 3_600_000) reason = requireReason(b.override_reason, "reason for a window longer than 24 hours");
    const clash = await findOverlap(w.starts_at, w.ends_at, id);
    if (clash) throw new ApiError(409, "OVERLAP", `Overlaps with "${clash.title}"`);
    await w.save();
    invalidateMaintenance();
    await writeAudit(platformActor(ctx), { action: "maintenance.edit", entity_type: "maintenance_window", entity_id: w._id, before, after: w.toObject(), reason });
    return NextResponse.json({ window: w });
  });
}

// POST /api/admin/maintenance/[id]?action=cancel|start-now|end-now - Emergency controls
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withPlatform(req, "maintenance.write", async (ctx) => {
    const { id } = await params;
    const action = new URL(req.url).searchParams.get("action");
    const w = await MaintenanceWindow.findById(oid(id));
    if (!w) throw new ApiError(404, "NOT_FOUND", "Window not found");
    const state = maintenanceState(w);
    const now = new Date();
    if (action === "cancel") {
      if (state !== "SCHEDULED") throw new ApiError(409, "INVALID_STATE", "Only scheduled windows can be cancelled — use End now for an active one");
      w.is_cancelled = true;
    } else if (action === "start-now") {
      if (state !== "SCHEDULED") throw new ApiError(409, "INVALID_STATE", "Window is not scheduled");
      w.started_early_at = now;
    } else if (action === "end-now") {
      if (state !== "ACTIVE") throw new ApiError(409, "INVALID_STATE", "Window is not active");
      w.ended_early_at = now;
    } else throw new ApiError(400, "VALIDATION_ERROR", "Unknown action");
    await w.save();
    invalidateMaintenance();
    await writeAudit(platformActor(ctx), { action: `maintenance.${action}`, entity_type: "maintenance_window", entity_id: w._id, before: { state }, after: { state: maintenanceState(w) } });
    return NextResponse.json({ window: { ...w.toObject(), state: maintenanceState(w) } });
  });
}
