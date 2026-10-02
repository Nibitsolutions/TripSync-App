import { NextRequest, NextResponse } from "next/server";
import Tenant from "@/models/Tenant";
import User from "@/models/User";
import { withPlatform, readJson, requireReason, ApiError, oid } from "@/lib/platform/http";
import { Permission } from "@/lib/platform/permissions";
import { assignSalesOwner, offboardAgency, restoreReadOnly, setLimits } from "@/lib/platform/lifecycle";
import { sendSetPasswordEmail } from "@/lib/platform/tokens";
import { platformActor, writeAudit } from "@/lib/platform/audit";

const ACTIONS: Record<string, Permission> = {
  offboard: "agencies.offboard",
  "restore-read-only": "agencies.offboard",
  "assign-owner": "agencies.assign_owner",
  "set-limits": "agencies.set_limits",
  "resend-invite": "agencies.edit_profile",
};

// POST /api/admin/agencies/[id]/{offboard|restore-read-only|assign-owner|set-limits|resend-invite}
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  const permission = ACTIONS[action];
  if (!permission) return NextResponse.json({ code: "NOT_FOUND", error: "Unknown action" }, { status: 404 });
  return withPlatform(req, permission, async (ctx) => {
    oid(id);
    const body = await readJson<Record<string, unknown>>(req);
    switch (action) {
      case "offboard": {
        const agency = await offboardAgency(ctx, id, {
          offboard_reason: String(body.offboard_reason || ""),
          retention_months: body.retention_months ? Number(body.retention_months) : undefined,
          note: typeof body.note === "string" ? body.note.trim() : undefined,
          notify: body.notify !== false,
        });
        return NextResponse.json({ agency });
      }
      case "restore-read-only":
        return NextResponse.json({ agency: await restoreReadOnly(ctx, id, requireReason(body.reason)) });
      case "assign-owner":
        return NextResponse.json({
          agency: await assignSalesOwner(ctx, id, (body.sales_owner_id as string) || null, typeof body.reason === "string" ? body.reason : null),
        });
      case "set-limits": {
        const seats = body.seats === undefined || body.seats === "" ? undefined : Number(body.seats);
        const branches = body.branches === undefined || body.branches === "" ? undefined : Number(body.branches);
        return NextResponse.json({ agency: await setLimits(ctx, id, seats, branches, requireReason(body.reason)) });
      }
      case "resend-invite": {
        const agency = await Tenant.findById(id).lean();
        if (!agency) throw new ApiError(404, "NOT_FOUND", "Agency not found");
        const owner = await User.findOne({ tenant_id: agency._id, role: "Owner" }).lean();
        if (!owner) throw new ApiError(409, "NO_OWNER", "This agency has no owner login yet (order not approved)");
        const link = await sendSetPasswordEmail({ _id: owner._id, name: owner.name, email: owner.email }, agency.status === "TRIAL" ? "trial" : "welcome");
        await writeAudit(platformActor(ctx), { action: "agency.resend_invite", entity_type: "agency", entity_id: agency._id, agency_id: agency._id });
        return NextResponse.json({ set_password_link: link });
      }
    }
    throw new ApiError(404, "NOT_FOUND", "Unknown action");
  });
}
