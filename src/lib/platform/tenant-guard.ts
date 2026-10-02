import { NextResponse } from "next/server";
import { headers } from "next/headers";
import Tenant from "@/models/Tenant";
import { getAgencyState } from "./lifecycle";
import { getMaintenanceSnapshot } from "./maintenance";
import { getSetting } from "./settings";

// Guard pipeline for agency (tenant) API requests (architecture §6.1):
// Maintenance → session epoch → effective status → route policy.
// Default-deny: any mutating route is blocked for EXPIRED agencies unless the
// caller explicitly allows it (the `allowWhenExpired` option = @AllowWhenExpired).

export interface TenantGuardUser {
  user_id: string;
  tenant_id: string;
  role: string;
  session_epoch?: number;
}

const g = globalThis as unknown as { __lastActive?: Map<string, number> };
const lastActive = (g.__lastActive ??= new Map<string, number>());

function deny(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ code, message, error: message, ...extra }, { status });
}

export async function enforceTenantAccess(
  user: TenantGuardUser,
  options: { allowWhenExpired?: boolean; method?: string } = {}
): Promise<NextResponse | null> {
  // 1. Maintenance
  const m = await getMaintenanceSnapshot();
  if (m.active) {
    return deny(503, "MAINTENANCE", m.active.reason_message || "Scheduled maintenance in progress", {
      maintenance: { title: m.active.title, reason_message: m.active.reason_message, starts_at: m.active.starts_at, ends_at: m.active.ends_at },
    });
  }

  // 2. Session epoch — bumped on suspend/offboard to kill sessions immediately.
  const state = await getAgencyState(user.tenant_id);
  if (!state) return deny(401, "UNAUTHORIZED", "Agency not found");
  if ((user.session_epoch ?? 0) !== state.session_epoch) {
    return deny(401, "SESSION_REVOKED", "Your session has ended. Please sign in again.");
  }

  // 3–4. Effective status + route policy
  let method = options.method;
  if (!method) {
    try {
      method = (await headers()).get("x-ts-method") || "";
    } catch {
      method = "";
    }
  }
  const readOnly = method === "GET" || method === "HEAD";

  switch (state.status) {
    case "TRIAL":
    case "ACTIVE":
      break;
    case "EXPIRED":
      if (!readOnly && !options.allowWhenExpired) {
        return deny(403, "SUBSCRIPTION_EXPIRED_READ_ONLY", "Your subscription has expired. You can view and export your data — renew to make changes.");
      }
      break;
    case "SUSPENDED": {
      const msgs = await getSetting("locked_messages");
      return deny(403, "ACCOUNT_SUSPENDED", msgs.suspended);
    }
    default: {
      const msgs = await getSetting("locked_messages");
      return deny(403, "ACCOUNT_OFFBOARDED", msgs.offboarded);
    }
  }

  // Track "last active" at most every 5 minutes per agency.
  const prev = lastActive.get(user.tenant_id) ?? 0;
  if (Date.now() - prev > 300_000) {
    lastActive.set(user.tenant_id, Date.now());
    Tenant.updateOne({ _id: user.tenant_id }, { $set: { last_active_at: new Date() } }).catch(() => {});
  }
  return null;
}

/**
 * Wrapper for /api/tenant/* routes: agency user only, `agency_id` from the token
 * (never client input), and @AllowWhenExpired semantics by default.
 */
export async function withTenant(
  handler: (user: TenantGuardUser & { name: string; email: string }) => Promise<NextResponse>,
  options: { allowWhenExpired?: boolean; ownerOnly?: boolean } = { allowWhenExpired: true }
): Promise<NextResponse> {
  const { connectDB } = await import("@/lib/mongodb");
  const { getAuthSession } = await import("@/lib/api-helpers");
  const { ApiError } = await import("./http");
  try {
    await connectDB();
    const user = await getAuthSession();
    if (!user?.tenant_id) return deny(401, "UNAUTHORIZED", "Unauthorized");
    const denied = await enforceTenantAccess(user, { allowWhenExpired: options.allowWhenExpired ?? true });
    if (denied) return denied;
    if (options.ownerOnly && user.role !== "Owner") return deny(403, "FORBIDDEN", "Only the agency owner can do this");
    return await handler(user);
  } catch (err) {
    if (err instanceof ApiError) return deny(err.status, err.code, err.message);
    console.error("[tenant] unhandled error", err);
    return deny(500, "INTERNAL_ERROR", "Something went wrong");
  }
}
