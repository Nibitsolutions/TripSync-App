import { NextRequest, NextResponse } from "next/server";
import { Broadcast, MaintenanceWindow } from "@/models/platform";
import { withPlatform, readJson, ApiError, requireReason } from "@/lib/platform/http";
import { findOverlap, invalidateMaintenance, maintenanceState } from "@/lib/platform/maintenance";
import { platformActor, writeAudit } from "@/lib/platform/audit";
import { escapeHtml } from "@/lib/platform/email";
import { formatPKT } from "@/lib/platform/db";

// GET /api/admin/maintenance - All windows with derived status
export async function GET(req: NextRequest) {
  return withPlatform(req, "maintenance.read", async () => {
    const rows = await MaintenanceWindow.find().sort({ starts_at: -1 }).limit(200).lean();
    return NextResponse.json({ data: rows.map((w) => ({ ...w, state: maintenanceState(w) })) });
  });
}

// POST /api/admin/maintenance - Schedule a window (optionally create an OPERATIONAL broadcast draft)
export async function POST(req: NextRequest) {
  return withPlatform(req, "maintenance.write", async (ctx) => {
    const b = await readJson<Record<string, unknown>>(req);
    const title = String(b.title || "").trim();
    if (!title) throw new ApiError(400, "VALIDATION_ERROR", "Title is required");
    const starts = new Date(String(b.starts_at));
    const ends = new Date(String(b.ends_at));
    if (isNaN(starts.getTime()) || isNaN(ends.getTime()) || ends <= starts) throw new ApiError(400, "VALIDATION_ERROR", "End must be after start");
    let overrideReason: string | null = null;
    if (ends.getTime() - starts.getTime() > 24 * 3_600_000) overrideReason = requireReason(b.override_reason, "reason for a window longer than 24 hours");
    const clash = await findOverlap(starts, ends);
    if (clash) throw new ApiError(409, "OVERLAP", `Overlaps with "${clash.title}"`);
    const notify = b.notify_in_app_from ? new Date(String(b.notify_in_app_from)) : new Date();

    let broadcastId = null;
    if (b.create_broadcast) {
      const html = `<p>Dear {{owner_name}},</p><p>TripSync will be unavailable for scheduled maintenance from <b>${formatPKT(starts, true)}</b> to <b>${formatPKT(ends, true)}</b> (PKT).</p><p>${escapeHtml(b.reason_message || "")}</p><p>Thank you for your patience.</p>`;
      const bc = await Broadcast.create({ subject: `Scheduled maintenance: ${title}`, html_body: html, text_body: "", type: "OPERATIONAL", audience_filter: { statuses: ["TRIAL", "ACTIVE", "EXPIRED"] }, status: "DRAFT", created_by: ctx.user.id });
      broadcastId = bc._id;
    }
    const w = await MaintenanceWindow.create({ title, reason_message: String(b.reason_message || ""), starts_at: starts, ends_at: ends, notify_in_app_from: notify, broadcast_id: broadcastId, created_by: ctx.user.id });
    invalidateMaintenance();
    await writeAudit(platformActor(ctx), { action: "maintenance.create", entity_type: "maintenance_window", entity_id: w._id, after: w.toObject(), reason: overrideReason });
    return NextResponse.json({ window: w, broadcast_id: broadcastId }, { status: 201 });
  });
}
