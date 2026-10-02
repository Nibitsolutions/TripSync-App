import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import { getAuthSession } from "@/lib/api-helpers";
import User from "@/models/User";
import Tenant from "@/models/Tenant";
import { can, isPlatformRole, Permission, PlatformRole } from "./permissions";
import { getSetting } from "./settings";

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role: PlatformRole;
}

export interface RequestMeta {
  ip: string | null;
  user_agent: string | null;
  request_id: string;
}

export interface PlatformContext extends RequestMeta {
  user: PlatformUser;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export function apiError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ code, message, error: message, details }, { status });
}

export function requestMeta(req: NextRequest | Request): RequestMeta {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  return {
    ip: (fwd ? fwd.split(",")[0].trim() : h.get("x-real-ip")) || null,
    user_agent: h.get("user-agent"),
    request_id: h.get("x-request-id") || crypto.randomUUID(),
  };
}

function handleError(err: unknown) {
  if (err instanceof ApiError) return apiError(err.status, err.code, err.message, err.details);
  const e = err as { name?: string; code?: number; message?: string };
  if (e?.name === "ValidationError" || e?.name === "CastError") return apiError(400, "VALIDATION_ERROR", e.message || "Invalid input");
  if (e?.code === 11000) return apiError(409, "DUPLICATE", "A record with the same unique value already exists");
  console.error("[platform] unhandled error", err);
  return apiError(500, "INTERNAL_ERROR", "Something went wrong");
}

interface PlatformOptions {
  /** Allow the call even if mandatory 2FA has not been set up yet (me / security endpoints). */
  allowWithout2fa?: boolean;
}

/**
 * Staff API guard: authenticated platform user, active, has `permission`.
 * Pass `null` to require only a valid platform login.
 */
export async function withPlatform(
  req: NextRequest | Request,
  permission: Permission | Permission[] | null,
  handler: (ctx: PlatformContext) => Promise<NextResponse>,
  options: PlatformOptions = {}
): Promise<NextResponse> {
  try {
    await connectDB();
    const session = await getAuthSession();
    if (!session) return apiError(401, "UNAUTHORIZED", "Unauthorized");
    if (!isPlatformRole(session.role)) return apiError(403, "FORBIDDEN", "Platform access required");

    const dbUser = await User.findById(session.user_id).select("name email role is_active totp_enabled").lean();
    if (!dbUser || dbUser.is_active === false || !isPlatformRole(dbUser.role)) {
      return apiError(401, "UNAUTHORIZED", "Account is inactive");
    }

    if (!options.allowWithout2fa && (dbUser.role === "SuperAdmin" || dbUser.role === "Manager") && !dbUser.totp_enabled) {
      const security = await getSetting("security");
      if (security.enforce_2fa) {
        return apiError(403, "TWO_FACTOR_SETUP_REQUIRED", "Set up two-factor authentication before continuing");
      }
    }

    const perms = permission === null ? [] : Array.isArray(permission) ? permission : [permission];
    if (perms.length && !perms.some((p) => can(dbUser.role, p))) {
      return apiError(403, "FORBIDDEN", "You do not have permission for this action");
    }

    const ctx: PlatformContext = {
      ...requestMeta(req),
      user: { id: String(dbUser._id), name: dbUser.name, email: dbUser.email, role: dbUser.role as PlatformRole },
    };
    return await handler(ctx);
  } catch (err) {
    return handleError(err);
  }
}

/** Wrap a public / tenant handler with the same error mapping. */
export async function withErrors(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    await connectDB();
    return await handler();
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// Row scoping (architecture §4.3) — a Sales Executive only sees agencies whose
// sales_owner_id is themselves. Central so filters are never hand-written.
// ---------------------------------------------------------------------------
export function agencyScope(user: PlatformUser): Record<string, unknown> {
  if (user.role === "SalesExecutive") return { sales_owner_id: new Types.ObjectId(user.id) };
  return {};
}

export async function scopedAgencyIds(user: PlatformUser): Promise<Types.ObjectId[] | null> {
  if (user.role !== "SalesExecutive") return null;
  const rows = await Tenant.find(agencyScope(user)).select("_id").lean();
  return rows.map((r) => r._id as Types.ObjectId);
}

/** Adds `agency_id ∈ own agencies` for Sales Executives. */
export async function scopeByAgency(user: PlatformUser, filter: Record<string, unknown> = {}) {
  const ids = await scopedAgencyIds(user);
  if (ids === null) return filter;
  if (filter.agency_id) {
    const wanted = String(filter.agency_id);
    return { ...filter, agency_id: ids.some((i) => String(i) === wanted) ? filter.agency_id : new Types.ObjectId() };
  }
  return { ...filter, agency_id: { $in: ids } };
}

export async function assertAgencyInScope(user: PlatformUser, agencyId: string | Types.ObjectId) {
  if (user.role !== "SalesExecutive") return;
  const ok = await Tenant.exists({ _id: agencyId, ...agencyScope(user) });
  if (!ok) throw new ApiError(404, "NOT_FOUND", "Not found");
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
export function pagination(url: URL) {
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const page_size = Math.min(100, Math.max(1, parseInt(url.searchParams.get("page_size") || "25", 10) || 25));
  return { page, page_size, skip: (page - 1) * page_size };
}

export function listResponse<T>(data: T[], page: number, page_size: number, total: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ data, page, page_size, total, ...extra });
}

export function isObjectId(id: unknown): id is string {
  return typeof id === "string" && Types.ObjectId.isValid(id) && /^[0-9a-f]{24}$/i.test(id);
}

export function oid(id: string | Types.ObjectId): Types.ObjectId {
  if (id instanceof Types.ObjectId) return id;
  if (!isObjectId(id)) throw new ApiError(400, "VALIDATION_ERROR", "Invalid id");
  return new Types.ObjectId(id);
}

export function requireReason(reason: unknown, label = "reason"): string {
  const r = typeof reason === "string" ? reason.trim() : "";
  if (r.length < 3) throw new ApiError(400, "REASON_REQUIRED", `A ${label} is required`);
  return r.slice(0, 1000);
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
}

export function csvResponse(filename: string, csv: string) {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/** Simple fixed-window in-process rate limiter (per key). */
const g = globalThis as unknown as { __platformRate?: Map<string, { count: number; reset: number }> };
const rateMap = (g.__platformRate ??= new Map());
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const hit = rateMap.get(key);
  if (!hit || hit.reset < now) {
    rateMap.set(key, { count: 1, reset: now + windowMs });
    return;
  }
  hit.count++;
  if (hit.count > limit) throw new ApiError(429, "RATE_LIMITED", "Too many requests — please try again later");
}
