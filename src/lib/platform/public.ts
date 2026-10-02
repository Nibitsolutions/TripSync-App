import { ApiError, RequestMeta, rateLimit } from "./http";
import { promises as dns } from "dns";

/** Abuse protection for public forms (architecture §7.14). */
export async function guardPublicForm(meta: RequestMeta, body: Record<string, unknown>, bucket: string) {
  rateLimit(`public:${bucket}:${meta.ip ?? "unknown"}`, 5, 3_600_000);
  // Honeypot: real users never fill the hidden "website" field.
  if (typeof body.website === "string" && body.website.trim()) throw new ApiError(400, "REJECTED", "Submission rejected");
  await verifyCaptcha(body.captcha_token as string | undefined, meta.ip);
}

/** Optional Cloudflare Turnstile — active only when TURNSTILE_SECRET_KEY is set. */
async function verifyCaptcha(token: string | undefined, ip: string | null) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return;
  if (!token) throw new ApiError(400, "CAPTCHA_REQUIRED", "Please complete the captcha");
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
  }).then((r) => r.json() as Promise<{ success: boolean }>).catch(() => ({ success: false }));
  if (!res.success) throw new ApiError(400, "CAPTCHA_FAILED", "Captcha verification failed");
}

/** Email format + MX sanity check (falls back to accept if DNS is unavailable). */
export async function assertDeliverableEmail(email: string) {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) throw new ApiError(400, "VALIDATION_ERROR", "Please enter a valid email address");
  const domain = clean.split("@")[1];
  try {
    const mx = await dns.resolveMx(domain);
    if (!mx.length) throw new ApiError(400, "VALIDATION_ERROR", "This email domain cannot receive mail");
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const code = (err as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "ENODATA") throw new ApiError(400, "VALIDATION_ERROR", "This email domain cannot receive mail");
  }
  return clean;
}
