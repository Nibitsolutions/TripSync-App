import { ClientSession, Types } from "mongoose";
import { PlatformAuditLog } from "@/models/platform";
import type { PlatformContext, RequestMeta } from "./http";

const SECRET_KEYS = /password|secret|token|totp|smtp_pass/i;

function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || depth > 6) return value ?? null;
  if (value instanceof Date) return value;
  if (value instanceof Types.ObjectId) return String(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "__v") continue;
      out[k] = SECRET_KEYS.test(k) && v ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface AuditInput {
  action: string;
  entity_type: string;
  entity_id?: string | Types.ObjectId | null;
  agency_id?: string | Types.ObjectId | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

type Actor =
  | { kind: "platform"; ctx: PlatformContext }
  | { kind: "system" }
  | { kind: "agency"; user_id: string; name?: string; role?: string; meta?: RequestMeta }
  | { kind: "public"; meta?: RequestMeta };

/**
 * Write one audit row. Pass the Mongo session when the change runs in a
 * transaction so the audit row commits (or rolls back) with it (N2).
 */
export async function writeAudit(actor: Actor, input: AuditInput, session?: ClientSession | null) {
  const base = {
    action: input.action,
    entity_type: input.entity_type,
    entity_id: input.entity_id ? String(input.entity_id) : null,
    agency_id: input.agency_id ? new Types.ObjectId(String(input.agency_id)) : null,
    before: (redact(input.before) as Record<string, unknown>) ?? null,
    after: (redact(input.after) as Record<string, unknown>) ?? null,
    reason: input.reason ?? null,
  };
  let actorFields: Record<string, unknown>;
  if (actor.kind === "platform") {
    actorFields = {
      actor_type: "PLATFORM_USER",
      actor_id: new Types.ObjectId(actor.ctx.user.id),
      actor_name: actor.ctx.user.name,
      actor_role: actor.ctx.user.role,
      ip: actor.ctx.ip,
      user_agent: actor.ctx.user_agent,
      request_id: actor.ctx.request_id,
    };
  } else if (actor.kind === "agency") {
    actorFields = {
      actor_type: "AGENCY_USER",
      actor_id: new Types.ObjectId(actor.user_id),
      actor_name: actor.name ?? null,
      actor_role: actor.role ?? null,
      ip: actor.meta?.ip ?? null,
      user_agent: actor.meta?.user_agent ?? null,
      request_id: actor.meta?.request_id ?? null,
    };
  } else if (actor.kind === "public") {
    actorFields = {
      actor_type: "PUBLIC",
      ip: actor.meta?.ip ?? null,
      user_agent: actor.meta?.user_agent ?? null,
      request_id: actor.meta?.request_id ?? null,
    };
  } else {
    actorFields = { actor_type: "SYSTEM", actor_name: "system" };
  }
  await PlatformAuditLog.create([{ ...base, ...actorFields }], session ? { session } : {});
}

export const platformActor = (ctx: PlatformContext): Actor => ({ kind: "platform", ctx });
export const systemActor: Actor = { kind: "system" };
