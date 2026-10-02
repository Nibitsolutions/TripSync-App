import { IMaintenanceWindow, MaintenanceWindow } from "@/models/platform";

export type MaintenanceState = "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

/** Derived status (architecture §7.8). */
export function maintenanceState(w: Pick<IMaintenanceWindow, "is_cancelled" | "starts_at" | "ends_at" | "started_early_at" | "ended_early_at">, now = new Date()): MaintenanceState {
  if (w.is_cancelled) return "CANCELLED";
  const start = w.started_early_at ? new Date(w.started_early_at) : new Date(w.starts_at);
  const end = w.ended_early_at ? new Date(w.ended_early_at) : new Date(w.ends_at);
  if (now >= end) return "COMPLETED";
  if (now >= start) return "ACTIVE";
  return "SCHEDULED";
}

export function effectiveWindow(w: Pick<IMaintenanceWindow, "starts_at" | "ends_at" | "started_early_at" | "ended_early_at">) {
  return {
    starts_at: w.started_early_at ? new Date(w.started_early_at) : new Date(w.starts_at),
    ends_at: w.ended_early_at ? new Date(w.ended_early_at) : new Date(w.ends_at),
  };
}

export interface MaintenanceInfo {
  id: string;
  title: string;
  reason_message: string;
  starts_at: Date;
  ends_at: Date;
}

interface Snapshot {
  active: MaintenanceInfo | null;
  upcoming: (MaintenanceInfo & { notify_in_app_from: Date }) | null;
  at: number;
}

// In-process cache (TTL 10 s) shared via globalThis — no per-request DB hit.
const g = globalThis as unknown as { __maintenanceCache?: Snapshot | null };

export function invalidateMaintenance() {
  g.__maintenanceCache = null;
}

export async function getMaintenanceSnapshot(): Promise<Snapshot> {
  const hit = g.__maintenanceCache;
  if (hit && Date.now() - hit.at < 10_000) return hit;
  const now = new Date();
  const windows = await MaintenanceWindow.find({
    is_cancelled: false,
    ended_early_at: null,
    ends_at: { $gt: now },
  })
    .sort({ starts_at: 1 })
    .limit(10)
    .lean();
  let active: Snapshot["active"] = null;
  let upcoming: Snapshot["upcoming"] = null;
  for (const w of windows) {
    const state = maintenanceState(w, now);
    const eff = effectiveWindow(w);
    const info = { id: String(w._id), title: w.title, reason_message: w.reason_message, ...eff };
    if (state === "ACTIVE" && !active) active = info;
    if (state === "SCHEDULED" && !upcoming) upcoming = { ...info, notify_in_app_from: new Date(w.notify_in_app_from) };
  }
  const snap = { active, upcoming, at: Date.now() };
  g.__maintenanceCache = snap;
  return snap;
}

/** Rejects overlap with other non-cancelled, not-yet-finished windows. */
export async function findOverlap(starts: Date, ends: Date, excludeId?: string) {
  const filter: Record<string, unknown> = {
    is_cancelled: false,
    starts_at: { $lt: ends },
    ends_at: { $gt: starts },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  const candidates = await MaintenanceWindow.find(filter).lean();
  return candidates.find((w) => {
    const eff = effectiveWindow(w);
    return eff.starts_at < ends && eff.ends_at > starts && maintenanceState(w) !== "COMPLETED";
  });
}
