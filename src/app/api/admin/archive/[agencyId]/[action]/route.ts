import { NextRequest, NextResponse } from "next/server";
import Tenant from "@/models/Tenant";
import { TenantArchive } from "@/models/platform";
import { withPlatform, readJson, requireReason, ApiError, oid } from "@/lib/platform/http";
import { deleteSnapshot, moveToColdStorage, restoreFromArchive, snapshotAgency } from "@/lib/platform/archive";
import { invalidateAgency } from "@/lib/platform/lifecycle";
import { platformActor, writeAudit } from "@/lib/platform/audit";

// POST /api/admin/archive/[agencyId]/{extend-retention|snapshot|archive-now|decision|restore}
export async function POST(req: NextRequest, { params }: { params: Promise<{ agencyId: string; action: string }> }) {
  return withPlatform(req, "archive.manage", async (ctx) => {
    const { agencyId, action } = await params;
    oid(agencyId);
    const agency = await Tenant.findById(agencyId);
    if (!agency) throw new ApiError(404, "NOT_FOUND", "Agency not found");
    const b = await readJson<Record<string, unknown>>(req);
    const fail = (err: unknown) => {
      throw new ApiError(409, "ARCHIVE_ERROR", (err as Error).message);
    };

    switch (action) {
      case "extend-retention": {
        if (agency.status !== "OFFBOARDED") throw new ApiError(409, "INVALID_STATE", "Only offboarded agencies have a retention period");
        const months = Math.floor(Number(b.months));
        if (!months || months < 1 || months > 120) throw new ApiError(400, "VALIDATION_ERROR", "months must be 1–120");
        const reason = requireReason(b.reason);
        const before = agency.retention_until;
        const base = agency.retention_until && agency.retention_until > new Date() ? new Date(agency.retention_until) : new Date();
        base.setUTCMonth(base.getUTCMonth() + months);
        agency.retention_until = base;
        agency.retention_months = (agency.retention_months ?? 0) + months;
        await agency.save();
        await writeAudit(platformActor(ctx), { action: "archive.extend_retention", entity_type: "agency", entity_id: agency._id, agency_id: agency._id, before: { retention_until: before }, after: { retention_until: base }, reason });
        return NextResponse.json({ agency });
      }
      case "snapshot": {
        if (!["OFFBOARDED", "EXPIRED", "ACTIVE", "TRIAL", "SUSPENDED"].includes(agency.status)) throw new ApiError(409, "INVALID_STATE", "No live data to export");
        const archive = await snapshotAgency(agencyId, "MANUAL_EXPORT").catch(fail);
        await writeAudit(platformActor(ctx), { action: "archive.snapshot", entity_type: "agency", entity_id: agency._id, agency_id: agency._id, after: { archive_id: archive!._id, size_bytes: archive!.size_bytes } });
        return NextResponse.json({ archive });
      }
      case "archive-now": {
        // Manual trigger of the retention flow (snapshot → verify → release).
        requireReason(b.reason);
        const archive = await moveToColdStorage(agencyId).catch(fail);
        await writeAudit(platformActor(ctx), { action: "archive.archive_now", entity_type: "agency", entity_id: agency._id, agency_id: agency._id, reason: String(b.reason) });
        return NextResponse.json({ archive });
      }
      case "decision": {
        if (agency.status !== "COLD_STORAGE") throw new ApiError(409, "INVALID_STATE", "Decisions apply to cold-storage agencies");
        const archive = await TenantArchive.findOne({ agency_id: agency._id, kind: "COLD_STORAGE", status: "VERIFIED" }).sort({ created_at: -1 });
        if (!archive) throw new ApiError(404, "NOT_FOUND", "No verified cold-storage snapshot");
        const decision = b.decision === "DELETE" ? "DELETE" : "RETAIN";
        const note = typeof b.note === "string" ? b.note : null;
        if (decision === "RETAIN") {
          archive.decision = "RETAINED";
          archive.decided_by = ctx.user.id as unknown as typeof archive.decided_by;
          archive.decided_at = new Date();
          archive.decision_note = note;
          await archive.save();
        } else {
          // Two-step confirmation: the agency name must be typed exactly.
          if (String(b.confirm_name || "").trim() !== agency.name) throw new ApiError(400, "CONFIRMATION_REQUIRED", "Type the agency name exactly to confirm deletion");
          requireReason(b.reason);
          await deleteSnapshot(String(archive._id));
          await TenantArchive.updateOne({ _id: archive._id }, { $set: { decided_by: ctx.user.id, decided_at: new Date(), decision_note: note ?? String(b.reason) } });
          agency.status = "PURGED";
          agency.purged_at = new Date();
          await agency.save();
          invalidateAgency(agencyId);
        }
        await writeAudit(platformActor(ctx), { action: `archive.decision_${decision.toLowerCase()}`, entity_type: "agency", entity_id: agency._id, agency_id: agency._id, after: { decision }, reason: (b.reason as string) || note });
        return NextResponse.json({ ok: true, decision });
      }
      case "restore": {
        if (agency.status !== "COLD_STORAGE") throw new ApiError(409, "INVALID_STATE", "Only cold-storage agencies can be restored");
        const reason = requireReason(b.reason);
        const archive = await TenantArchive.findOne({ agency_id: agency._id, kind: "COLD_STORAGE", status: "VERIFIED" }).sort({ created_at: -1 }).lean();
        if (!archive) throw new ApiError(404, "NOT_FOUND", "No verified snapshot to restore");
        const result = await restoreFromArchive(String(archive._id)).catch(fail);
        await writeAudit(platformActor(ctx), { action: "archive.restore", entity_type: "agency", entity_id: agency._id, agency_id: agency._id, after: result, reason });
        return NextResponse.json({ ok: true, ...result });
      }
    }
    throw new ApiError(404, "NOT_FOUND", "Unknown action");
  });
}
