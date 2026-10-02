import { NextRequest, NextResponse } from "next/server";
import User from "@/models/User";
import Tenant from "@/models/Tenant";
import { CommissionEarner, SupportTicket } from "@/models/platform";
import { withPlatform, readJson, ApiError, oid } from "@/lib/platform/http";
import { isPlatformRole } from "@/lib/platform/permissions";
import { platformActor, writeAudit } from "@/lib/platform/audit";
import { sendSetPasswordEmail } from "@/lib/platform/tokens";

// PATCH /api/admin/team/[id] - Edit name/role, deactivate/reactivate (never delete)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withPlatform(req, "team.manage", async (ctx) => {
    const { id } = await params;
    const user = await User.findById(oid(id));
    if (!user || !isPlatformRole(user.role)) throw new ApiError(404, "NOT_FOUND", "User not found");
    const b = await readJson<{ name?: string; role?: string; is_active?: boolean; reassign_to?: string | null }>(req);
    const before = { name: user.name, role: user.role, is_active: user.is_active };
    if (id === ctx.user.id && (b.is_active === false || (b.role && b.role !== user.role))) throw new ApiError(400, "VALIDATION_ERROR", "You cannot deactivate or change the role of your own account");
    if (b.name) user.name = b.name.trim();
    if (b.role) {
      if (!isPlatformRole(b.role)) throw new ApiError(400, "VALIDATION_ERROR", "Invalid role");
      user.role = b.role;
      if (b.role === "SalesExecutive" && !(await CommissionEarner.exists({ platform_user_id: user._id }))) {
        await CommissionEarner.create({ type: "SALES_EXECUTIVE", platform_user_id: user._id, name: user.name, email: user.email, commission_percent: 0, created_by: ctx.user.id });
      }
    }
    if (b.is_active !== undefined) user.is_active = b.is_active;
    if (user.role === "SuperAdmin" && user.is_active === false) {
      const others = await User.countDocuments({ role: "SuperAdmin", is_active: { $ne: false }, _id: { $ne: user._id } });
      if (!others) throw new ApiError(400, "VALIDATION_ERROR", "At least one active Super Admin is required");
    }
    await user.save();

    let reassigned = 0;
    if (b.is_active === false) {
      // Tickets fall to Unassigned; agencies keep sales_owner_id unless bulk-reassigned.
      await SupportTicket.updateMany({ assigned_to_platform_user_id: user._id, status: { $ne: "CLOSED" } }, { $set: { assigned_to_platform_user_id: null } });
      await CommissionEarner.updateOne({ platform_user_id: user._id }, { $set: { is_active: false } });
    }
    if (b.is_active === true) await CommissionEarner.updateOne({ platform_user_id: user._id }, { $set: { is_active: true } });
    if (b.reassign_to !== undefined) {
      if (b.reassign_to) {
        const target = await User.findOne({ _id: b.reassign_to, role: "SalesExecutive", is_active: { $ne: false } }).lean();
        if (!target) throw new ApiError(400, "VALIDATION_ERROR", "Reassign target must be an active Sales Executive");
      }
      const agencies = await Tenant.find({ sales_owner_id: user._id }).select("_id").lean();
      const res = await Tenant.updateMany({ sales_owner_id: user._id }, { $set: { sales_owner_id: b.reassign_to || null } });
      await SupportTicket.updateMany({ agency_id: { $in: agencies.map((a) => a._id) }, status: { $ne: "CLOSED" } }, { $set: { assigned_to_platform_user_id: b.reassign_to || null } });
      reassigned = res.modifiedCount;
    }
    await writeAudit(platformActor(ctx), {
      action: b.is_active === false ? "team.user_deactivate" : b.role && b.role !== before.role ? "team.role_change" : "team.user_edit",
      entity_type: "platform_user",
      entity_id: user._id,
      before,
      after: { name: user.name, role: user.role, is_active: user.is_active, reassigned_agencies: reassigned },
    });
    return NextResponse.json({ user: { _id: user._id, name: user.name, email: user.email, role: user.role, is_active: user.is_active }, reassigned });
  });
}

// POST /api/admin/team/[id]?action=reset-password|reset-2fa|unlock
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withPlatform(req, "team.manage", async (ctx) => {
    const { id } = await params;
    const action = new URL(req.url).searchParams.get("action");
    const user = await User.findById(oid(id));
    if (!user || !isPlatformRole(user.role)) throw new ApiError(404, "NOT_FOUND", "User not found");
    if (action === "reset-password") {
      const link = await sendSetPasswordEmail({ _id: user._id, name: user.name, email: user.email }, "invite");
      await writeAudit(platformActor(ctx), { action: "team.reset_password", entity_type: "platform_user", entity_id: user._id });
      return NextResponse.json({ set_password_link: link });
    }
    if (action === "reset-2fa") {
      user.totp_enabled = false;
      user.totp_secret_encrypted = null;
      await user.save();
      await writeAudit(platformActor(ctx), { action: "team.reset_2fa", entity_type: "platform_user", entity_id: user._id });
      return NextResponse.json({ ok: true });
    }
    if (action === "unlock") {
      user.locked_until = null;
      user.failed_attempts = 0;
      await user.save();
      await writeAudit(platformActor(ctx), { action: "team.unlock", entity_type: "platform_user", entity_id: user._id });
      return NextResponse.json({ ok: true });
    }
    throw new ApiError(400, "VALIDATION_ERROR", "Unknown action");
  });
}
