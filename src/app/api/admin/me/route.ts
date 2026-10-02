import { NextRequest, NextResponse } from "next/server";
import User from "@/models/User";
import { withPlatform } from "@/lib/platform/http";
import { permissionsFor, PLATFORM_ROLE_LABELS } from "@/lib/platform/permissions";
import { getSetting, isTwoFactorEnforced } from "@/lib/platform/settings";

// GET /api/admin/me - Current platform user, permissions and 2FA state
export async function GET(req: NextRequest) {
  return withPlatform(
    req,
    null,
    async (ctx) => {
      const u = await User.findById(ctx.user.id).select("totp_enabled last_login_at").lean();
      const security = await getSetting("security");
      const needs2fa = (ctx.user.role === "SuperAdmin" || ctx.user.role === "Manager") && !u?.totp_enabled && isTwoFactorEnforced(security);
      return NextResponse.json({
        user: { ...ctx.user, role_label: PLATFORM_ROLE_LABELS[ctx.user.role] },
        permissions: permissionsFor(ctx.user.role),
        totp_enabled: Boolean(u?.totp_enabled),
        requires_2fa_setup: needs2fa,
      });
    },
    { allowWithout2fa: true }
  );
}
