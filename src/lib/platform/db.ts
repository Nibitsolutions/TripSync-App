import mongoose, { ClientSession } from "mongoose";
import { PlatformCounter } from "@/models/platform";

let transactionsSupported: boolean | null = null;

/**
 * Run `fn` inside a MongoDB multi-document transaction (Atlas / replica set).
 * On a standalone server (no transaction support) it runs without a session so
 * local development still works; production must use a replica set.
 */
export async function withTxn<T>(fn: (session: ClientSession | null) => Promise<T>): Promise<T> {
  if (transactionsSupported === false) return fn(null);
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    transactionsSupported = true;
    return result as T;
  } catch (err) {
    const e = err as { code?: number; codeName?: string; message?: string };
    const unsupported =
      e?.code === 20 || e?.codeName === "IllegalOperation" || /replica set|Transaction numbers/i.test(e?.message || "");
    if (unsupported && transactionsSupported !== true) {
      transactionsSupported = false;
      console.warn("[platform] MongoDB transactions unavailable — running without transaction (use a replica set in production)");
      return fn(null);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

export const sessionOpt = (session: ClientSession | null) => (session ? { session } : {});

/** Gapless sequence: increments inside the caller's transaction. */
export async function nextNumber(name: "order" | "receipt" | "ticket", session: ClientSession | null): Promise<number> {
  const doc = await PlatformCounter.findOneAndUpdate(
    { _id: name },
    { $inc: { last_number: 1 } },
    { upsert: true, returnDocument: "after", ...sessionOpt(session) }
  ).lean();
  return doc!.last_number;
}

export function formatNumber(prefix: string, n: number) {
  return `${prefix}-${String(n).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// Money: whole PKR, half-up rounding (N5).
// ---------------------------------------------------------------------------
export function roundHalfUp(n: number): number {
  return n >= 0 ? Math.floor(n + 0.5) : -Math.floor(-n + 0.5);
}

export function formatPKR(n: number): string {
  return `PKR ${Math.round(n).toLocaleString("en-PK")}`;
}

// ---------------------------------------------------------------------------
// Dates — stored UTC, displayed Asia/Karachi DD-MM-YYYY (N8).
// ---------------------------------------------------------------------------
export const DAY_MS = 86_400_000;

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // Clamp end-of-month overflow (31 Jan + 1 month → 28/29 Feb).
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function formatPKT(date: Date | string | null | undefined, withTime = false): string {
  if (!date) return "-";
  const d = new Date(date);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const base = `${get("day")}-${get("month")}-${get("year")}`;
  return withTime ? `${base} ${get("hour")}:${get("minute")}` : base;
}

export function daysLeft(expires: Date | string | null | undefined, now = new Date()): number | null {
  if (!expires) return null;
  return Math.ceil((new Date(expires).getTime() - now.getTime()) / DAY_MS);
}
