import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import User from "@/models/User";
import Tenant from "@/models/Tenant";
import { CommissionEarner } from "@/models/platform";
import { withPlatform, readJson, ApiError } from "@/lib/platform/http";
import { isPlatformRole } from "@/lib/platform/permissions";
import { platformActor, writeAudit } from "@/lib/platform/audit";
import { randomToken } from "@/lib/platform/crypto";
import { sendSetPasswordEmail } from "@/lib/platform/tokens";
import { sessionOpt, withTxn } from "@/lib/platform/db";

// GET /api/admin/team - Platform users
export async function GET(req: NextRequest) {
  return withPlatform(req, "team.manage", async () => {
    const users = await User.find({ role: { $in: ["SuperAdmin", "Manager", "SalesExecutive"] } })
      .select("name email role is_active totp_enabled last_login_at locked_until created_at")
      .sort({ is_active: -1, role: 1, name: 1 })
      .lean();
    const owned = await Tenant.aggregate([{ $match: { sales_owner_id: { $in: users.map((u) => u._id) } } }, { $group: { _id: "$sales_owner_id", n: { $sum: 1 } } }]);
    const ownedMap = new Map(owned.map((o) => [String(o._id), o.n]));
    return NextResponse.json({ data: users.map((u) => ({ ...u, is_active: u.is_active !== false, agencies_owned: ownedMap.get(String(u._id)) ?? 0 })) });
  });
}

// POST /api/admin/team - Invite a platform user (set-password email). Sales Executives get an earner record.
export async function POST(req: NextRequest) {
  return withPlatform(req, "team.manage", async (ctx) => {
    const b = await readJson<{ name?: string; email?: string; role?: string; commission_percent?: number }>(req);
    const name = String(b.name || "").trim();
    const email = String(b.email || "").trim().toLowerCase();
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new ApiError(400, "VALIDATION_ERROR", "Name and a valid email are required");
    if (!isPlatformRole(b.role)) throw new ApiError(400, "VALIDATION_ERROR", "Role must be SuperAdmin, Manager or SalesExecutive");
    if (await User.exists({ email })) throw new ApiError(409, "EMAIL_IN_USE", "Email already in use");
    const result = await withTxn(async (session) => {
      const [user] = await User.create(
        [{ tenant_id: null, name, email, role: b.role, password: await bcrypt.hash(randomToken(24), 10), is_active: false, created_by: ctx.user.id }],
        sessionOpt(session)
      );
      if (b.role === "SalesExecutive") {
        await CommissionEarner.create([{ type: "SALES_EXECUTIVE", platform_user_id: user._id, name, email, commission_percent: Number(b.commission_percent) || 0, created_by: ctx.user.id }], sessionOpt(session));
      }
      const link = await sendSetPasswordEmail({ _id: user._id, name, email }, "invite", session);
      await writeAudit(platformActor(ctx), { action: "team.user_create", entity_type: "platform_user", entity_id: user._id, after: { name, email, role: b.role } }, session);
      return { user: { _id: user._id, name, email, role: user.role }, set_password_link: link };
    });
    return NextResponse.json(result, { status: 201 });
  });
}
