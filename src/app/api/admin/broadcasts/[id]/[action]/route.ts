import { NextRequest, NextResponse } from "next/server";
import { Broadcast, BroadcastRecipient, EmailOutbox } from "@/models/platform";
import { withPlatform, readJson, oid, ApiError, pagination, listResponse } from "@/lib/platform/http";
import { cancelBroadcast, previewAudience, renderVariables, unsubscribeUrl } from "@/lib/platform/broadcast";
import { sendDirect } from "@/lib/platform/email";
import { formatPKT } from "@/lib/platform/db";
import { platformActor, writeAudit } from "@/lib/platform/audit";

// GET /api/admin/broadcasts/[id]/recipients - Per-recipient status
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; action: string }> }) {
  return withPlatform(req, "broadcast.read", async () => {
    const { id, action } = await params;
    if (action !== "recipients") throw new ApiError(404, "NOT_FOUND", "Unknown action");
    const url = new URL(req.url);
    const { page, page_size, skip } = pagination(url);
    const filter: Record<string, unknown> = { broadcast_id: oid(id) };
    const status = url.searchParams.get("status");
    if (status) filter.status = status;
    const [rows, total] = await Promise.all([
      BroadcastRecipient.find(filter).sort({ _id: 1 }).skip(skip).limit(page_size).lean(),
      BroadcastRecipient.countDocuments(filter),
    ]);
    const errors = new Map(
      (await EmailOutbox.find({ _id: { $in: rows.map((r) => r.outbox_id).filter(Boolean) } }).select("last_error attempts").lean()).map((o) => [String(o._id), o])
    );
    return listResponse(rows.map((r) => ({ ...r, last_error: r.outbox_id ? errors.get(String(r.outbox_id))?.last_error ?? null : null })), page, page_size, total);
  });
}

// POST /api/admin/broadcasts/[id]/{audience-preview|test-send|send|cancel|retry-failed}
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; action: string }> }) {
  return withPlatform(req, "broadcast.send", async (ctx) => {
    const { id, action } = await params;
    const b = await Broadcast.findById(oid(id));
    if (!b) throw new ApiError(404, "NOT_FOUND", "Broadcast not found");
    const body = await readJson<{ scheduled_at?: string | null }>(req);

    switch (action) {
      case "audience-preview":
        return NextResponse.json(await previewAudience(b.audience_filter || {}, b.type));
      case "test-send": {
        const vars = { agency_name: "Sample Travel Agency", owner_name: ctx.user.name, expiry_date: formatPKT(new Date(Date.now() + 14 * 86_400_000)), days_left: "14", unsubscribe_url: unsubscribeUrl(ctx.user.email) };
        try {
          await sendDirect(ctx.user.email, `[TEST] ${renderVariables(b.subject, vars)}`, renderVariables(b.html_body, vars));
        } catch (err) {
          throw new ApiError(502, "SMTP_ERROR", (err as Error).message);
        }
        return NextResponse.json({ ok: true, sent_to: ctx.user.email });
      }
      case "send": {
        if (b.status !== "DRAFT" && b.status !== "SCHEDULED") throw new ApiError(409, "INVALID_STATE", `Broadcast is ${b.status}`);
        const when = body.scheduled_at ? new Date(body.scheduled_at) : null;
        if (when && isNaN(when.getTime())) throw new ApiError(400, "VALIDATION_ERROR", "Invalid schedule time");
        const preview = await previewAudience(b.audience_filter || {}, b.type);
        if (!preview.eligible) throw new ApiError(400, "EMPTY_AUDIENCE", "No eligible recipients for this audience");
        b.status = "SCHEDULED";
        b.scheduled_at = when && when > new Date() ? when : null;
        await b.save();
        await writeAudit(platformActor(ctx), { action: "broadcast.send", entity_type: "broadcast", entity_id: b._id, after: { scheduled_at: b.scheduled_at, type: b.type, audience: b.audience_filter, eligible: preview.eligible } });
        // Expansion happens in the broadcast-dispatcher job (within a minute) so this request stays fast.
        return NextResponse.json({ broadcast: b, eligible: preview.eligible });
      }
      case "cancel": {
        const res = await cancelBroadcast(id);
        if (!res) throw new ApiError(409, "INVALID_STATE", "Only draft, scheduled or sending broadcasts can be cancelled");
        await writeAudit(platformActor(ctx), { action: "broadcast.cancel", entity_type: "broadcast", entity_id: b._id });
        return NextResponse.json({ broadcast: res });
      }
      case "retry-failed": {
        const failed = await BroadcastRecipient.find({ broadcast_id: b._id, status: "FAILED" }).select("outbox_id").lean();
        const ids = failed.map((f) => f.outbox_id).filter(Boolean);
        await EmailOutbox.updateMany({ _id: { $in: ids } }, { $set: { status: "PENDING", attempts: 0, next_attempt_at: new Date(), last_error: null } });
        await BroadcastRecipient.updateMany({ broadcast_id: b._id, status: "FAILED" }, { $set: { status: "QUEUED" } });
        if (ids.length && b.status === "SENT") {
          b.status = "SENDING";
          await b.save();
        }
        return NextResponse.json({ retried: ids.length });
      }
    }
    throw new ApiError(404, "NOT_FOUND", "Unknown action");
  });
}
