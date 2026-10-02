import { NextRequest, NextResponse } from "next/server";
import { withPlatform, readJson, requireReason, ApiError, oid } from "@/lib/platform/http";
import { activateAgency, suspendAgency } from "@/lib/platform/lifecycle";

// POST /api/admin/agencies/[id]/toggle - Suspend (pauses the clock) or activate (resumes it)
// body: { action: "suspend" | "activate", reason }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await readJson<{ action?: string; reason?: string }>(req);
  const permission = body.action === "activate" ? "agencies.activate" : "agencies.suspend";
  return withPlatform(req, permission, async (ctx) => {
    const { id } = await params;
    oid(id);
    if (body.action === "suspend") {
      const agency = await suspendAgency(ctx, id, requireReason(body.reason));
      return NextResponse.json({ agency, message: "Agency suspended" });
    }
    if (body.action === "activate") {
      const agency = await activateAgency(ctx, id, body.reason?.trim() || null);
      return NextResponse.json({ agency, message: "Agency activated" });
    }
    throw new ApiError(400, "VALIDATION_ERROR", "action must be 'suspend' or 'activate'");
  });
}
