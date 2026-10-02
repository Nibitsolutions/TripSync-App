import { NextRequest, NextResponse } from "next/server";
import { Broadcast, BroadcastRecipient, IAudienceFilter } from "@/models/platform";
import { withPlatform, readJson, oid, ApiError } from "@/lib/platform/http";
import { prepareBody } from "@/lib/platform/broadcast";
import { platformActor, writeAudit } from "@/lib/platform/audit";

// GET /api/admin/broadcasts/[id] - Broadcast with recipient status counts
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withPlatform(req, "broadcast.read", async () => {
    const { id } = await params;
    const b = await Broadcast.findById(oid(id)).lean();
    if (!b) throw new ApiError(404, "NOT_FOUND", "Broadcast not found");
    const counts = await BroadcastRecipient.aggregate([{ $match: { broadcast_id: b._id } }, { $group: { _id: "$status", n: { $sum: 1 } } }]);
    return NextResponse.json({ broadcast: b, counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) });
  });
}

// PATCH /api/admin/broadcasts/[id] - Edit draft (sanitized on save)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withPlatform(req, "broadcast.send", async (ctx) => {
    const { id } = await params;
    const doc = await Broadcast.findById(oid(id));
    if (!doc) throw new ApiError(404, "NOT_FOUND", "Broadcast not found");
    if (doc.status !== "DRAFT" && doc.status !== "SCHEDULED") throw new ApiError(409, "LOCKED", "Only drafts and scheduled broadcasts can be edited");
    const b = await readJson<{ subject?: string; html_body?: string; type?: string; audience_filter?: IAudienceFilter }>(req);
    if (b.subject !== undefined) doc.subject = String(b.subject).trim() || doc.subject;
    if (b.type !== undefined) doc.type = b.type === "OPERATIONAL" ? "OPERATIONAL" : "PROMOTIONAL";
    if (b.html_body !== undefined || b.type !== undefined) {
      const prepared = prepareBody({ html_body: b.html_body ?? doc.html_body, type: doc.type });
      doc.html_body = prepared.html_body;
      doc.text_body = prepared.text_body;
    }
    if (b.audience_filter !== undefined) doc.audience_filter = b.audience_filter;
    await doc.save();
    await writeAudit(platformActor(ctx), { action: "broadcast.edit", entity_type: "broadcast", entity_id: doc._id, after: { subject: doc.subject, type: doc.type, audience_filter: doc.audience_filter } });
    return NextResponse.json({ broadcast: doc });
  });
}
