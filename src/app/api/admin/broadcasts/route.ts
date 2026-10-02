import { NextRequest, NextResponse } from "next/server";
import User from "@/models/User";
import { Broadcast, IAudienceFilter } from "@/models/platform";
import { withPlatform, readJson, pagination, listResponse, ApiError } from "@/lib/platform/http";
import { prepareBody } from "@/lib/platform/broadcast";
import { platformActor, writeAudit } from "@/lib/platform/audit";

// GET /api/admin/broadcasts - History
export async function GET(req: NextRequest) {
  return withPlatform(req, "broadcast.read", async () => {
    const url = new URL(req.url);
    const { page, page_size, skip } = pagination(url);
    const [rows, total] = await Promise.all([
      Broadcast.find().select("-html_body -text_body").sort({ created_at: -1 }).skip(skip).limit(page_size).lean(),
      Broadcast.countDocuments(),
    ]);
    const names = new Map((await User.find({ _id: { $in: rows.map((r) => r.created_by).filter(Boolean) } }).select("name").lean()).map((u) => [String(u._id), u.name]));
    return listResponse(rows.map((r) => ({ ...r, created_by_name: r.created_by ? names.get(String(r.created_by)) ?? null : null })), page, page_size, total);
  });
}

// POST /api/admin/broadcasts - Create draft (sanitized on save)
export async function POST(req: NextRequest) {
  return withPlatform(req, "broadcast.send", async (ctx) => {
    const b = await readJson<{ subject?: string; html_body?: string; type?: string; audience_filter?: IAudienceFilter }>(req);
    const subject = String(b.subject || "").trim();
    if (!subject) throw new ApiError(400, "VALIDATION_ERROR", "Subject is required");
    const type = b.type === "OPERATIONAL" ? "OPERATIONAL" : "PROMOTIONAL";
    const doc = await Broadcast.create({ subject, type, ...prepareBody({ ...b, type }), audience_filter: b.audience_filter || {}, status: "DRAFT", created_by: ctx.user.id });
    await writeAudit(platformActor(ctx), { action: "broadcast.create", entity_type: "broadcast", entity_id: doc._id, after: { subject, type, audience_filter: doc.audience_filter } });
    return NextResponse.json({ broadcast: doc }, { status: 201 });
  });
}
