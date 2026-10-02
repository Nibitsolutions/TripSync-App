import { ClientSession, Types } from "mongoose";
import bcrypt from "bcryptjs";
import { AuthToken } from "@/models/platform";
import User from "@/models/User";
import { randomToken, sha256 } from "./crypto";
import { sessionOpt } from "./db";
import { appUrl, enqueueEmail, templates } from "./email";

export async function createAuthToken(
  userId: string | Types.ObjectId,
  purpose: "SET_PASSWORD" | "PASSWORD_RESET",
  ttlHours: number,
  session: ClientSession | null = null
) {
  const raw = randomToken(32);
  await AuthToken.create(
    [{ token_hash: sha256(raw), purpose, user_id: userId, expires_at: new Date(Date.now() + ttlHours * 3_600_000) }],
    sessionOpt(session)
  );
  return raw;
}

export function setPasswordLink(raw: string) {
  return appUrl(`/set-password?token=${encodeURIComponent(raw)}`);
}

/** Create a set-password token and queue the email. Returns the link (for sharing manually). */
export async function sendSetPasswordEmail(
  user: { _id: Types.ObjectId | string; name: string; email: string },
  context: "trial" | "welcome" | "invite",
  session: ClientSession | null = null
) {
  const raw = await createAuthToken(user._id, "SET_PASSWORD", 72, session);
  const link = setPasswordLink(raw);
  const t = await templates.setPassword(user.name, link, context);
  await enqueueEmail(
    { to: user.email, ...t, category: "AUTH", related_type: "user", related_id: String(user._id), idempotency_key: `setpw:${sha256(raw)}` },
    session
  );
  return link;
}

/** Consume a single-use token and set the password. Activates the user. */
export async function consumePasswordToken(raw: string, password: string) {
  if (!raw || password.length < 8) return { ok: false as const, error: "Password must be at least 8 characters" };
  const tok = await AuthToken.findOneAndUpdate(
    { token_hash: sha256(raw), used_at: null, expires_at: { $gt: new Date() } },
    { $set: { used_at: new Date() } },
    { returnDocument: "after" }
  ).lean();
  if (!tok) return { ok: false as const, error: "This link is invalid or has expired" };
  const hash = await bcrypt.hash(password, 10);
  const user = await User.findByIdAndUpdate(
    tok.user_id,
    { $set: { password: hash, is_active: true, failed_attempts: 0, locked_until: null } },
    { returnDocument: "after" }
  ).lean();
  if (!user) return { ok: false as const, error: "Account not found" };
  return { ok: true as const, email: user.email, role: user.role };
}
