import { NextResponse } from "next/server";
import User from "@/models/User";
import { withErrors, readJson, rateLimit, requestMeta, ApiError } from "@/lib/platform/http";
import { consumePasswordToken, createAuthToken } from "@/lib/platform/tokens";
import { appUrl, enqueueEmail, templates } from "@/lib/platform/email";
import { sha256 } from "@/lib/platform/crypto";

// POST /api/public/set-password - Consume a set-password / verify / reset token
// POST /api/public/set-password { action: "request_reset", email } - Request a reset link (60 min)
export async function POST(req: Request) {
  return withErrors(async () => {
    const meta = requestMeta(req);
    rateLimit(`setpw:${meta.ip ?? "unknown"}`, 20, 3_600_000);
    const b = await readJson<{ action?: string; token?: string; password?: string; email?: string }>(req);
    if (b.action === "request_reset") {
      const email = String(b.email || "").trim().toLowerCase();
      const user = email ? await User.findOne({ email }).lean() : null;
      // Same response either way — no account-existence leak.
      if (user && user.is_active !== false) {
        const raw = await createAuthToken(user._id, "PASSWORD_RESET", 1);
        const t = await templates.passwordReset(user.name, appUrl(`/set-password?token=${encodeURIComponent(raw)}&reset=1`));
        await enqueueEmail({ to: user.email, ...t, category: "AUTH", related_type: "user", related_id: String(user._id), idempotency_key: `reset:${sha256(raw)}` });
      }
      return NextResponse.json({ ok: true, message: "If an account exists for this email, a reset link has been sent." });
    }
    const result = await consumePasswordToken(String(b.token || ""), String(b.password || ""));
    if (!result.ok) throw new ApiError(400, "INVALID_TOKEN", result.error);
    return NextResponse.json({ ok: true, email: result.email });
  });
}
