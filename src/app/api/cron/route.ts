import { NextRequest, NextResponse } from "next/server";
import { runDueJobs } from "@/lib/platform/jobs";

export const maxDuration = 60;

// GET /api/cron - Runs all due background jobs (outbox, expiry sweep, reminders, broadcasts…).
// For serverless hosting (Vercel) where the in-process scheduler cannot run.
// Call every 1–5 minutes with header `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends this
// automatically) or `?key=<CRON_SECRET>` from an external cron service.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  const auth = req.headers.get("authorization");
  const key = new URL(req.url).searchParams.get("key");
  if (auth !== `Bearer ${secret}` && key !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const results = await runDueJobs();
  return NextResponse.json({ ok: true, ran_at: new Date().toISOString(), results });
}
