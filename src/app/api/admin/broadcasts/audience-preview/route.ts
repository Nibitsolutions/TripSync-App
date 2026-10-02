import { NextRequest, NextResponse } from "next/server";
import { IAudienceFilter } from "@/models/platform";
import { withPlatform, readJson } from "@/lib/platform/http";
import { previewAudience } from "@/lib/platform/broadcast";

// POST /api/admin/broadcasts/audience-preview - Count + sample for an unsaved audience filter
export async function POST(req: NextRequest) {
  return withPlatform(req, "broadcast.read", async () => {
    const b = await readJson<{ audience_filter?: IAudienceFilter; type?: "PROMOTIONAL" | "OPERATIONAL" }>(req);
    return NextResponse.json(await previewAudience(b.audience_filter || {}, b.type === "OPERATIONAL" ? "OPERATIONAL" : "PROMOTIONAL"));
  });
}
