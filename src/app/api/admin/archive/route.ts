import { NextRequest } from "next/server";
import Tenant from "@/models/Tenant";
import { TenantArchive } from "@/models/platform";
import { withPlatform, pagination, listResponse, escapeRegex } from "@/lib/platform/http";
import { estimateAgencyRows } from "@/lib/platform/archive";
import { daysLeft } from "@/lib/platform/db";

// GET /api/admin/archive - Offboarded / cold storage / purged agencies
export async function GET(req: NextRequest) {
  return withPlatform(req, "archive.read", async () => {
    const url = new URL(req.url);
    const sp = url.searchParams;
    const filter: Record<string, unknown> = { status: { $in: sp.get("status") ? [sp.get("status")] : ["OFFBOARDED", "COLD_STORAGE", "PURGED"] } };
    const q = (sp.get("q") || "").trim();
    if (q) filter.name = new RegExp(escapeRegex(q), "i");
    const { page, page_size, skip } = pagination(url);
    const [rows, total] = await Promise.all([Tenant.find(filter).sort({ retention_until: 1 }).skip(skip).limit(page_size).lean(), Tenant.countDocuments(filter)]);
    const archives = await TenantArchive.find({ agency_id: { $in: rows.map((r) => r._id) } }).sort({ created_at: -1 }).lean();
    const data = await Promise.all(
      rows.map(async (a) => {
        const list = archives.filter((x) => String(x.agency_id) === String(a._id));
        const last = list[0] ?? null;
        const cold = list.find((x) => x.kind === "COLD_STORAGE" && x.status !== "FAILED") ?? null;
        return {
          _id: String(a._id),
          name: a.name,
          status: a.status,
          offboard_reason: a.offboard_reason,
          offboard_note: a.offboard_note,
          offboarded_at: a.offboarded_at,
          retention_until: a.retention_until,
          days_left: a.status === "OFFBOARDED" ? daysLeft(a.retention_until) : null,
          estimated_rows: a.status === "OFFBOARDED" ? await estimateAgencyRows(a._id) : null,
          snapshot_size_bytes: cold?.size_bytes ?? last?.size_bytes ?? null,
          last_snapshot: last ? { id: String(last._id), kind: last.kind, status: last.status, created_at: last.created_at, error: last.error } : null,
          cold_archive_id: cold ? String(cold._id) : null,
          decision: cold?.decision ?? null,
          cold_storage_at: a.cold_storage_at,
          purged_at: a.purged_at,
        };
      })
    );
    return listResponse(data, page, page_size, total);
  });
}
