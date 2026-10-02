import { connectDB } from "@/lib/mongodb";
import Tenant from "@/models/Tenant";
import {
  AuthToken,
  Broadcast,
  ExpiryReminderSent,
  JobState,
  Order,
  PlatformCost,
  SubscriptionPeriod,
  SupportTicket,
} from "@/models/platform";
import { systemActor, writeAudit } from "./audit";
import { addMonths } from "./db";
import { dispatchOutbox, enqueueEmail, templates } from "./email";
import { getSetting } from "./settings";
import { invalidateAgency, migrateLegacyTenants } from "./lifecycle";
import { expandBroadcast, finalizeBroadcasts } from "./broadcast";
import { invalidateMaintenance } from "./maintenance";
import { alertSuperAdmins, moveToColdStorage } from "./archive";

// Background jobs (architecture §12) — replaces pg-boss with a Mongo-locked
// in-process scheduler. Every job is idempotent and safe to run on several
// instances: a job runs only after it claims its lock in `platform_job_state`.

type JobFn = () => Promise<unknown>;
interface JobDef {
  name: string;
  everyMs: number;
  /** For daily jobs: run once per day after this hour in Asia/Karachi. */
  dailyAtPktHour?: number;
  fn: JobFn;
}

// ---------------------------------------------------------------------------
async function agencyExpirySweep() {
  const now = new Date();
  const lapsed = await Tenant.find({ status: { $in: ["TRIAL", "ACTIVE"] }, access_expires_at: { $ne: null, $lte: now } })
    .select("_id name status owner_email contact_email access_expires_at")
    .limit(500)
    .lean();
  for (const a of lapsed) {
    const res = await Tenant.updateOne({ _id: a._id, status: a.status }, { $set: { status: "EXPIRED" } });
    if (!res.modifiedCount) continue;
    invalidateAgency(String(a._id));
    await writeAudit(systemActor, { action: "agency.expire", entity_type: "agency", entity_id: a._id, agency_id: a._id, before: { status: a.status }, after: { status: "EXPIRED" } });
    const to = a.owner_email || a.contact_email;
    if (to) {
      const t = await templates.expired(a.name);
      await enqueueEmail({ to, ...t, category: "LIFECYCLE", related_type: "agency", related_id: String(a._id), idempotency_key: `expired:${a._id}:${new Date(a.access_expires_at!).getTime()}` });
    }
  }

  // Apply limits for renewal periods that start now (§7.3.1).
  const starting = await SubscriptionPeriod.find({ limits_applied: false, voided_at: null, starts_at: { $lte: now } }).limit(500).lean();
  for (const p of starting) {
    const claim = await SubscriptionPeriod.updateOne({ _id: p._id, limits_applied: false }, { $set: { limits_applied: true } });
    if (!claim.modifiedCount) continue;
    const before = await Tenant.findById(p.agency_id).select("max_users branch_limit").lean();
    await Tenant.updateOne({ _id: p.agency_id }, { $set: { max_users: p.seats, branch_limit: p.branches } });
    invalidateAgency(String(p.agency_id));
    await writeAudit(systemActor, { action: "agency.period_limits_applied", entity_type: "agency", entity_id: p.agency_id, agency_id: p.agency_id, before, after: { max_users: p.seats, branch_limit: p.branches } });
  }
  return { expired: lapsed.length, periods: starting.length };
}

/** Reminders at configured offsets; trials at 24 h. One per (agency, expires_at, offset). */
async function expiryReminders() {
  const offsets = [...(await getSetting("expiry_reminder_offsets_hours"))].sort((a, b) => a - b);
  const now = new Date();
  const maxH = Math.max(...offsets, 24);
  const agencies = await Tenant.find({
    status: { $in: ["TRIAL", "ACTIVE"] },
    access_expires_at: { $gt: now, $lte: new Date(now.getTime() + maxH * 3_600_000) },
  })
    .select("_id name status owner_email contact_email access_expires_at")
    .lean();
  let sent = 0;
  for (const a of agencies) {
    const to = a.owner_email || a.contact_email;
    if (!to) continue;
    const exp = new Date(a.access_expires_at!);
    const hoursLeft = (exp.getTime() - now.getTime()) / 3_600_000;
    const isTrial = a.status === "TRIAL";
    const list = isTrial ? [24] : offsets;
    const applicable = list.filter((o) => hoursLeft <= o);
    if (!applicable.length) continue;
    if (await Order.exists({ agency_id: a._id, status: "PENDING", type: { $in: ["RENEWAL", "CONVERSION"] } })) continue;
    const smallest = applicable[0];
    let isNew = false;
    for (const o of applicable) {
      const r = await ExpiryReminderSent.updateOne({ agency_id: a._id, expires_at: exp, offset_hours: o }, { $setOnInsert: { sent_at: now } }, { upsert: true });
      if (o === smallest && r.upsertedCount) isNew = true;
    }
    if (!isNew) continue;
    const t = await templates.expiryReminder(a.name, exp, isTrial);
    await enqueueEmail({ to, ...t, category: "REMINDER", related_type: "agency", related_id: String(a._id), idempotency_key: `reminder:${a._id}:${exp.getTime()}:${smallest}` });
    sent++;
  }
  return { sent };
}

async function broadcastDispatcher() {
  const due = await Broadcast.find({ status: "SCHEDULED", $or: [{ scheduled_at: null }, { scheduled_at: { $lte: new Date() } }] }).select("_id").limit(5).lean();
  for (const b of due) await expandBroadcast(String(b._id));
  await finalizeBroadcasts();
  return { started: due.length };
}

async function maintenanceStateJob() {
  invalidateMaintenance();
  return {};
}

async function ticketAutoclose() {
  const cutoff = new Date(Date.now() - 7 * 86_400_000);
  const res = await SupportTicket.updateMany({ status: "RESOLVED", resolved_at: { $lte: cutoff } }, { $set: { status: "CLOSED", closed_at: new Date() } });
  return { closed: res.modifiedCount };
}

async function retentionSweep() {
  const now = new Date();
  const day = 86_400_000;
  for (const days of [30, 7]) {
    const soon = await Tenant.find({ status: "OFFBOARDED", retention_until: { $gt: now, $lte: new Date(now.getTime() + days * day) } }).select("_id name retention_until").lean();
    for (const a of soon) {
      await alertSuperAdmins(
        `Retention ends in ≤ ${days} days: ${a.name}`,
        `Retention for ${a.name} ends on ${new Date(a.retention_until!).toISOString().slice(0, 10)}. It will then be archived to cold storage. Extend retention in the Archive module if needed.`,
        `retention-${days}:${a._id}:${new Date(a.retention_until!).getTime()}`
      );
    }
  }
  const due = await Tenant.find({ status: "OFFBOARDED", retention_until: { $ne: null, $lte: now } }).select("_id").limit(20).lean();
  let archived = 0;
  for (const a of due) {
    try {
      await moveToColdStorage(String(a._id));
      archived++;
    } catch {
      // Alert already sent by moveToColdStorage; retried on the next run.
    }
  }
  return { archived, due: due.length };
}

async function recurringCosts() {
  const now = new Date();
  const parents = await PlatformCost.find({ is_recurring_monthly: true, voided_at: null, recurring_parent_id: null }).lean();
  let created = 0;
  for (const p of parents) {
    let next = addMonths(new Date(p.cost_date), 1);
    let i = 1;
    while (next <= now && (!p.recurring_ends_on || next <= new Date(p.recurring_ends_on)) && i <= 120) {
      const r = await PlatformCost.updateOne(
        { recurring_parent_id: p._id, cost_date: next },
        { $setOnInsert: { category: p.category, description: p.description, amount: p.amount, is_recurring_monthly: false, created_by: p.created_by } },
        { upsert: true }
      );
      if (r.upsertedCount) created++;
      i++;
      next = addMonths(new Date(p.cost_date), i);
    }
  }
  return { created };
}

async function tokenCleanup() {
  const res = await AuthToken.deleteMany({ expires_at: { $lt: new Date(Date.now() - 86_400_000) } });
  return { deleted: res.deletedCount };
}

// ---------------------------------------------------------------------------
export const JOBS: JobDef[] = [
  { name: "outbox-dispatcher", everyMs: 15_000, fn: dispatchOutbox },
  { name: "agency-expiry-sweep", everyMs: 5 * 60_000, fn: agencyExpirySweep },
  { name: "expiry-reminders", everyMs: 60 * 60_000, fn: expiryReminders },
  { name: "broadcast-dispatcher", everyMs: 60_000, fn: broadcastDispatcher },
  { name: "maintenance-state", everyMs: 60_000, fn: maintenanceStateJob },
  { name: "ticket-autoclose", everyMs: 24 * 3_600_000, fn: ticketAutoclose },
  { name: "retention-sweep", everyMs: 24 * 3_600_000, dailyAtPktHour: 2, fn: retentionSweep },
  { name: "recurring-costs", everyMs: 24 * 3_600_000, fn: recurringCosts },
  { name: "token-cleanup", everyMs: 24 * 3_600_000, fn: tokenCleanup },
];

function pktDate(d: Date) {
  return new Date(d.getTime() + 5 * 3_600_000); // PKT = UTC+5, no DST
}

function isDue(job: JobDef, lastStarted: Date | null, now: Date) {
  if (!lastStarted) return job.dailyAtPktHour === undefined || pktDate(now).getUTCHours() >= job.dailyAtPktHour;
  if (job.dailyAtPktHour !== undefined) {
    const n = pktDate(now);
    const l = pktDate(lastStarted);
    const sameDay = n.toISOString().slice(0, 10) === l.toISOString().slice(0, 10);
    return !sameDay && n.getUTCHours() >= job.dailyAtPktHour;
  }
  return now.getTime() - lastStarted.getTime() >= job.everyMs;
}

export async function runJob(job: JobDef, force = false) {
  const now = new Date();
  const state = await JobState.findById(job.name).lean();
  if (!force && !isDue(job, state?.last_started_at ?? null, now)) return { skipped: "not due" };
  const lockMs = Math.max(60_000, Math.min(job.everyMs, 30 * 60_000));
  // Claim lock: only one instance runs a job at a time.
  const claimed = await JobState.findOneAndUpdate(
    { _id: job.name, $or: [{ locked_until: null }, { locked_until: { $lt: now } }] },
    { $set: { locked_until: new Date(now.getTime() + lockMs), last_started_at: now } },
    { returnDocument: "after" }
  ).catch(() => null);
  if (!claimed) {
    if (!state) {
      try {
        await JobState.create({ _id: job.name, locked_until: new Date(now.getTime() + lockMs), last_started_at: now, consecutive_failures: 0 });
      } catch {
        return { skipped: "locked" };
      }
    } else return { skipped: "locked" };
  }
  try {
    const result = await job.fn();
    await JobState.updateOne({ _id: job.name }, { $set: { locked_until: null, last_finished_at: new Date(), last_error: null, consecutive_failures: 0 } });
    return { ok: true, result };
  } catch (err) {
    const msg = (err as Error).message?.slice(0, 1000) || "failed";
    console.error(`[jobs] ${job.name} failed:`, err);
    const after = await JobState.findOneAndUpdate(
      { _id: job.name },
      { $set: { locked_until: null, last_finished_at: new Date(), last_error: msg }, $inc: { consecutive_failures: 1 } },
      { returnDocument: "after" }
    ).lean();
    if (after && after.consecutive_failures === 3) {
      await alertSuperAdmins(`Job ${job.name} failing`, `The background job ${job.name} failed 3 times in a row. Last error: ${msg}`, `job-fail:${job.name}:${now.toISOString().slice(0, 13)}`).catch(() => {});
    }
    return { ok: false, error: msg };
  }
}

let migrated = false;

export async function runDueJobs(force = false) {
  await connectDB();
  if (!migrated) {
    migrated = true;
    await migrateLegacyTenants().catch((e) => console.error("[jobs] migration failed", e));
  }
  const results: Record<string, unknown> = {};
  for (const job of JOBS) results[job.name] = await runJob(job, force);
  return results;
}

/** Starts the in-process scheduler once per server process. */
export function startScheduler() {
  const g = globalThis as unknown as { __platformScheduler?: NodeJS.Timeout };
  if (g.__platformScheduler || process.env.PLATFORM_JOBS === "off") return;
  const tick = () => runDueJobs().catch((e) => console.error("[jobs] tick failed", e));
  g.__platformScheduler = setInterval(tick, 15_000);
  setTimeout(tick, 5_000);
}
