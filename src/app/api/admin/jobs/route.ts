import { NextRequest, NextResponse } from "next/server";
import { JobState, EmailOutbox } from "@/models/platform";
import { withPlatform, readJson, ApiError } from "@/lib/platform/http";
import { JOBS, runJob } from "@/lib/platform/jobs";
import { platformActor, writeAudit } from "@/lib/platform/audit";

// GET /api/admin/jobs - Job status + outbox health
export async function GET(req: NextRequest) {
  return withPlatform(req, "settings.read", async () => {
    const [states, outbox] = await Promise.all([
      JobState.find().lean(),
      EmailOutbox.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    ]);
    const map = new Map(states.map((s) => [s._id, s]));
    return NextResponse.json({
      jobs: JOBS.map((j) => ({ name: j.name, every_ms: j.everyMs, ...(map.get(j.name) ?? {}) })),
      outbox: Object.fromEntries(outbox.map((o) => [o._id, o.n])),
    });
  });
}

// POST /api/admin/jobs - Run one job now (Super Admin). body: { name }
export async function POST(req: NextRequest) {
  return withPlatform(req, "settings.write", async (ctx) => {
    const { name } = await readJson<{ name?: string }>(req);
    const job = JOBS.find((j) => j.name === name);
    if (!job) throw new ApiError(404, "NOT_FOUND", "Unknown job");
    const result = await runJob(job, true);
    await writeAudit(platformActor(ctx), { action: "job.run_manual", entity_type: "job", entity_id: name, after: result as Record<string, unknown> });
    return NextResponse.json(result);
  });
}
