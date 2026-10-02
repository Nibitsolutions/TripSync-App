import { NextRequest, NextResponse } from "next/server";
import { withPlatform, readJson, ApiError } from "@/lib/platform/http";
import { putSetting, SETTING_KEYS, SettingKey, validateSetting } from "@/lib/platform/settings";
import { platformActor, writeAudit } from "@/lib/platform/audit";
import { sendDirect, emailLayout } from "@/lib/platform/email";

// PUT /api/admin/settings/[key] - Update one setting (secrets encrypted; audit values redacted)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  return withPlatform(req, "settings.write", async (ctx) => {
    const { key } = await params;
    if (!SETTING_KEYS.includes(key as SettingKey)) throw new ApiError(404, "NOT_FOUND", "Unknown setting");
    const { value } = await readJson<{ value: unknown }>(req);
    const err = validateSetting(key as SettingKey, value);
    if (err) throw new ApiError(400, "VALIDATION_ERROR", err);
    const { before, after } = await putSetting(key as SettingKey, value, ctx.user.id);
    await writeAudit(platformActor(ctx), { action: "settings.change", entity_type: "setting", entity_id: key, before: before as Record<string, unknown>, after: after as Record<string, unknown> });
    return NextResponse.json({ ok: true });
  });
}

// POST /api/admin/settings/smtp - Send a test email to the current user
export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  return withPlatform(req, "settings.write", async (ctx) => {
    const { key } = await params;
    if (key !== "smtp") throw new ApiError(404, "NOT_FOUND", "Unknown action");
    try {
      await sendDirect(ctx.user.email, "TripSync SMTP test", await emailLayout("SMTP test", "<p>Your SMTP settings work.</p>"));
    } catch (e) {
      throw new ApiError(502, "SMTP_ERROR", (e as Error).message);
    }
    return NextResponse.json({ ok: true, sent_to: ctx.user.email });
  });
}
