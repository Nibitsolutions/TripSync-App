import { NextRequest, NextResponse } from "next/server";
import { withPlatform } from "@/lib/platform/http";
import { can } from "@/lib/platform/permissions";
import { getAllSettingsRedacted } from "@/lib/platform/settings";

// GET /api/admin/settings - All settings; secrets are never returned (Managers see no secret indicators either)
export async function GET(req: NextRequest) {
  return withPlatform(req, "settings.read", async (ctx) => {
    return NextResponse.json({ settings: await getAllSettingsRedacted(can(ctx.user.role, "settings.write")), can_write: can(ctx.user.role, "settings.write") });
  });
}
