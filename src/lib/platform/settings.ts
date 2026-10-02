import { PlatformSetting } from "@/models/platform";
import { decryptString, encryptString } from "./crypto";

// Settings keys and defaults (architecture §7.13).
export interface SettingsShape {
  smtp: { host: string; port: number; secure: boolean; username: string; password: string };
  email_from: { address: string; name: string; reply_to: string };
  email_throttle: { per_minute: number; per_hour: number };
  support_contact: { whatsapp: string; email: string };
  payment_instructions: { bank_name: string; account_title: string; account_number: string; iban: string; qr_image_url: string };
  trial_days: number;
  expiry_reminder_offsets_hours: number[];
  default_retention_months: number;
  locked_messages: { suspended: string; offboarded: string };
  receipt_tax: { enabled: boolean; rate_percent: number; seller_name: string; seller_address: string; seller_ntn: string };
  notification_toggles: { suspension_email: boolean; offboard_email: boolean; ticket_emails: boolean; reactivation_email: boolean };
  security: { enforce_2fa: boolean };
}

export type SettingKey = keyof SettingsShape;

export const SETTING_DEFAULTS: SettingsShape = {
  smtp: { host: "", port: 587, secure: false, username: "", password: "" },
  email_from: { address: "no-reply@tripsync.pk", name: "TripSync", reply_to: "" },
  email_throttle: { per_minute: 30, per_hour: 1000 },
  support_contact: { whatsapp: "", email: "" },
  payment_instructions: { bank_name: "", account_title: "", account_number: "", iban: "", qr_image_url: "" },
  trial_days: 7,
  expiry_reminder_offsets_hours: [504, 336, 168, 24],
  default_retention_months: 12,
  locked_messages: {
    suspended: "Your account has been suspended. Please get in touch with support.",
    offboarded: "This account is paused/closed. Contact support to restore it.",
  },
  receipt_tax: { enabled: false, rate_percent: 0, seller_name: "TripSync", seller_address: "", seller_ntn: "" },
  notification_toggles: { suspension_email: true, offboard_email: true, ticket_emails: true, reactivation_email: true },
  security: { enforce_2fa: true },
};

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];

// Settings that contain secrets: stored encrypted, never returned in plain text.
const SECRET_FIELDS: Partial<Record<SettingKey, string[]>> = { smtp: ["password"] };

const CACHE_TTL_MS = 10_000;
const g = globalThis as unknown as { __platformSettingsCache?: Map<string, { value: unknown; at: number }> };
const cache = (g.__platformSettingsCache ??= new Map());

function mergeDefaults<K extends SettingKey>(key: K, stored: unknown): SettingsShape[K] {
  const def = SETTING_DEFAULTS[key];
  if (stored === null || stored === undefined) return structuredClone(def);
  if (Array.isArray(def) || typeof def !== "object") return stored as SettingsShape[K];
  return { ...(def as object), ...(stored as object) } as SettingsShape[K];
}

/** Returns the setting with secrets decrypted — server-side use only. */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingsShape[K]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return structuredClone(hit.value) as SettingsShape[K];
  const doc = await PlatformSetting.findOne({ key }).lean();
  const value = mergeDefaults(key, doc?.value);
  const secrets = SECRET_FIELDS[key];
  if (secrets && value && typeof value === "object") {
    for (const f of secrets) {
      const v = (value as Record<string, unknown>)[f];
      try {
        (value as Record<string, unknown>)[f] = typeof v === "string" && v.startsWith("v1:") ? decryptString(v) : v ?? "";
      } catch {
        (value as Record<string, unknown>)[f] = "";
      }
    }
  }
  cache.set(key, { value, at: Date.now() });
  return structuredClone(value);
}

/** All settings with secret values masked — safe to send to the browser. */
export async function getAllSettingsRedacted(includeSecrets: boolean) {
  const out: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    const value = (await getSetting(key)) as unknown;
    const secrets = SECRET_FIELDS[key];
    if (secrets && value && typeof value === "object") {
      for (const f of secrets) {
        const has = Boolean((value as Record<string, unknown>)[f]);
        (value as Record<string, unknown>)[f] = includeSecrets && has ? "••••••••" : "";
        (value as Record<string, unknown>)[`${f}_set`] = has;
      }
    }
    out[key] = value;
  }
  return out;
}

/**
 * Persist a setting. For secret fields, an empty string or the mask keeps the
 * previously stored value. Returns redacted before/after for the audit log.
 */
export async function putSetting(key: SettingKey, value: unknown, userId: string | null) {
  const existing = await PlatformSetting.findOne({ key }).lean();
  let toStore = value;
  const secrets = SECRET_FIELDS[key];
  if (secrets && value && typeof value === "object") {
    toStore = { ...(value as object) };
    for (const f of secrets) {
      const incoming = (toStore as Record<string, unknown>)[f];
      delete (toStore as Record<string, unknown>)[`${f}_set`];
      if (!incoming || incoming === "••••••••") {
        (toStore as Record<string, unknown>)[f] = (existing?.value as Record<string, unknown> | undefined)?.[f] ?? "";
      } else {
        (toStore as Record<string, unknown>)[f] = encryptString(String(incoming));
      }
    }
  }
  await PlatformSetting.updateOne(
    { key },
    { $set: { value: toStore, updated_by: userId, updated_at: new Date() } },
    { upsert: true }
  );
  cache.delete(key);
  const redact = (v: unknown) => {
    if (!secrets || !v || typeof v !== "object") return v;
    const c = { ...(v as Record<string, unknown>) };
    for (const f of secrets) if (c[f]) c[f] = "[REDACTED]";
    return c;
  };
  return { before: redact(existing?.value ?? null), after: redact(toStore) };
}

export function validateSetting(key: SettingKey, value: unknown): string | null {
  const def = SETTING_DEFAULTS[key];
  if (typeof def === "number") {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return `${key} must be a non-negative number`;
    return null;
  }
  if (Array.isArray(def)) {
    if (!Array.isArray(value) || value.some((n) => typeof n !== "number" || n <= 0)) return `${key} must be a list of positive numbers`;
    return null;
  }
  if (!value || typeof value !== "object") return `${key} must be an object`;
  return null;
}
