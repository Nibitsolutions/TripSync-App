import crypto from "crypto";

// AES-256-GCM for secrets at rest (SMTP password, TOTP seeds, archive snapshots).
// Key comes from PLATFORM_ENCRYPTION_KEY (32 bytes, hex or base64); falls back to a
// key derived from NEXTAUTH_SECRET so development works out of the box.
function getKey(): Buffer {
  const raw = process.env.PLATFORM_ENCRYPTION_KEY;
  if (raw) {
    const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (buf.length === 32) return buf;
  }
  const secret = process.env.NEXTAUTH_SECRET || "tripsync-dev-secret";
  return crypto.createHash("sha256").update(`platform-encryption:${secret}`).digest();
}

export function encryptString(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptString(payload: string | null | undefined): string {
  if (!payload) return "";
  const [v, ivB64, tagB64, dataB64] = payload.split(":");
  if (v !== "v1" || !ivB64 || !tagB64 || dataB64 === undefined) return "";
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

export function encryptBuffer(plain: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

export function decryptBuffer(payload: Buffer): Buffer {
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const data = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function sha256(input: string | Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

// Unguessable 8-char payment reference, no ambiguous characters.
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function randomReference(length = 8): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return out;
}

// HMAC-signed tokens for unsubscribe links (no DB row needed).
export function signValue(value: string): string {
  const mac = crypto.createHmac("sha256", getKey()).update(value).digest("base64url");
  return `${Buffer.from(value).toString("base64url")}.${mac}`;
}

export function verifySignedValue(token: string): string | null {
  const [b64, mac] = token.split(".");
  if (!b64 || !mac) return null;
  const value = Buffer.from(b64, "base64url").toString("utf8");
  const expected = crypto.createHmac("sha256", getKey()).update(value).digest("base64url");
  if (expected.length !== mac.length) return null;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(mac)) ? value : null;
}
