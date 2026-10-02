import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import User from "@/models/User";
import { apiError, readJson, withPlatform } from "@/lib/platform/http";
import { decryptString, encryptString } from "@/lib/platform/crypto";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/platform/totp";
import { platformActor, writeAudit } from "@/lib/platform/audit";
import { getSetting, isTwoFactorEnforced } from "@/lib/platform/settings";

// POST /api/admin/security - 2FA setup/enable/disable and password change
// body: { action: "setup" | "enable" | "disable" | "change_password", code?, current_password?, new_password? }
export async function POST(req: NextRequest) {
  return withPlatform(
    req,
    null,
    async (ctx) => {
      const body = await readJson<{ action?: string; code?: string; current_password?: string; new_password?: string }>(req);
      const user = await User.findById(ctx.user.id);
      if (!user) return apiError(404, "NOT_FOUND", "User not found");

      if (body.action === "setup") {
        if (user.totp_enabled) return apiError(409, "ALREADY_ENABLED", "Two-factor authentication is already enabled");
        const secret = generateTotpSecret();
        user.totp_secret_encrypted = encryptString(secret);
        await user.save();
        const uri = totpUri(secret, user.email);
        const qr_data_url = await QRCode.toDataURL(uri, { margin: 1, width: 220, errorCorrectionLevel: "M" });
        return NextResponse.json({ secret, otpauth_uri: uri, qr_data_url });
      }

      if (body.action === "enable") {
        if (!user.totp_secret_encrypted) return apiError(400, "SETUP_REQUIRED", "Start setup first");
        if (!verifyTotp(decryptString(user.totp_secret_encrypted), body.code || "")) return apiError(400, "INVALID_CODE", "Invalid authentication code");
        user.totp_enabled = true;
        await user.save();
        await writeAudit(platformActor(ctx), { action: "auth.2fa_enabled", entity_type: "platform_user", entity_id: user._id });
        return NextResponse.json({ totp_enabled: true });
      }

      if (body.action === "disable") {
        const security = await getSetting("security");
        if (isTwoFactorEnforced(security) && (ctx.user.role === "SuperAdmin" || ctx.user.role === "Manager")) {
          return apiError(403, "FORBIDDEN", "Two-factor authentication is mandatory for your role");
        }
        if (!user.totp_enabled || !verifyTotp(decryptString(user.totp_secret_encrypted), body.code || "")) {
          return apiError(400, "INVALID_CODE", "Invalid authentication code");
        }
        user.totp_enabled = false;
        user.totp_secret_encrypted = null;
        await user.save();
        await writeAudit(platformActor(ctx), { action: "auth.2fa_disabled", entity_type: "platform_user", entity_id: user._id });
        return NextResponse.json({ totp_enabled: false });
      }

      if (body.action === "change_password") {
        if (!body.current_password || !(await bcrypt.compare(body.current_password, user.password))) {
          return apiError(400, "INVALID_PASSWORD", "Current password is incorrect");
        }
        if (!body.new_password || body.new_password.length < 8) return apiError(400, "VALIDATION_ERROR", "New password must be at least 8 characters");
        user.password = await bcrypt.hash(body.new_password, 10);
        await user.save();
        await writeAudit(platformActor(ctx), { action: "auth.password_changed", entity_type: "platform_user", entity_id: user._id });
        return NextResponse.json({ ok: true });
      }

      return apiError(400, "VALIDATION_ERROR", "Unknown action");
    },
    { allowWithout2fa: true }
  );
}
