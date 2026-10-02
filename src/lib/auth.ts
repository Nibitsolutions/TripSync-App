import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { connectDB } from "./mongodb";
import User from "@/models/User";
import Tenant from "@/models/Tenant";
import { isPlatformRole } from "./platform/permissions";
import { getEffectiveStatus } from "./platform/lifecycle";
import { getSetting } from "./platform/settings";
import { decryptString } from "./platform/crypto";
import { verifyTotp } from "./platform/totp";
import { writeAudit } from "./platform/audit";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

async function supportSuffix() {
  const s = await getSetting("support_contact");
  const parts = [s.whatsapp && `WhatsApp: ${s.whatsapp}`, s.email && `Email: ${s.email}`].filter(Boolean);
  return parts.length ? ` (${parts.join(" · ")})` : "";
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totp: { label: "Authentication code", type: "text" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        await connectDB();
        const email = credentials.email.trim();
        const user = await User.findOne({ email: { $in: [email, email.toLowerCase()] } });
        if (!user) return null;

        const platform = isPlatformRole(user.role);
        const meta = {
          ip: (req?.headers?.["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? null,
          user_agent: (req?.headers?.["user-agent"] as string | undefined) ?? null,
          request_id: crypto.randomUUID(),
        };

        // Platform lockout: 5 failed logins → 15-minute lock.
        if (platform && user.locked_until && new Date(user.locked_until) > new Date()) {
          const mins = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60_000);
          throw new Error(`Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) {
          if (platform) {
            user.failed_attempts = (user.failed_attempts ?? 0) + 1;
            if (user.failed_attempts >= MAX_FAILED) {
              user.locked_until = new Date(Date.now() + LOCK_MINUTES * 60_000);
              user.failed_attempts = 0;
            }
            await user.save();
            await writeAudit({ kind: "public", meta }, { action: "auth.login_failed", entity_type: "platform_user", entity_id: user._id, after: { email: user.email, locked: Boolean(user.locked_until && user.locked_until > new Date()) } }).catch(() => {});
          }
          return null;
        }

        // Messages below are shown only after correct credentials (no account-existence leak).
        if (user.is_active === false) {
          throw new Error(
            platform
              ? "This account has been deactivated."
              : "Please activate your account using the set-password link sent to your email."
          );
        }

        if (platform && user.totp_enabled && user.totp_secret_encrypted) {
          const code = (credentials.totp || "").trim();
          if (!code) throw new Error("TOTP_REQUIRED");
          if (!verifyTotp(decryptString(user.totp_secret_encrypted), code)) {
            await writeAudit({ kind: "public", meta }, { action: "auth.2fa_failed", entity_type: "platform_user", entity_id: user._id }).catch(() => {});
            throw new Error("Invalid authentication code");
          }
        }

        let sessionEpoch = 0;
        if (!platform && user.tenant_id) {
          const tenant = await Tenant.findById(user.tenant_id).lean();
          if (!tenant) return null;
          const status = getEffectiveStatus(tenant);
          const locked = await getSetting("locked_messages");
          if (status === "SUSPENDED") throw new Error(`${locked.suspended}${await supportSuffix()}`);
          if (!["TRIAL", "ACTIVE", "EXPIRED"].includes(status)) throw new Error(`${locked.offboarded}${await supportSuffix()}`);
          sessionEpoch = tenant.session_epoch ?? 0;
        }

        if (platform) {
          user.failed_attempts = 0;
          user.locked_until = null;
        }
        user.last_login_at = new Date();
        await user.save();
        if (platform) {
          await writeAudit(
            { kind: "platform", ctx: { ...meta, user: { id: String(user._id), name: user.name, email: user.email, role: user.role } } },
            { action: "auth.login", entity_type: "platform_user", entity_id: user._id }
          ).catch(() => {});
        }

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
          tenant_id: user.tenant_id ? user.tenant_id.toString() : null,
          session_epoch: sessionEpoch,
        } as { id: string; email: string; name: string; role: string; tenant_id: string | null; session_epoch: number };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as { role: string; tenant_id: string | null; id: string; session_epoch?: number };
        token.role = u.role;
        token.tenant_id = u.tenant_id || undefined;
        token.user_id = u.id;
        token.session_epoch = u.session_epoch ?? 0;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as Record<string, unknown>).role = token.role;
        (session.user as Record<string, unknown>).tenant_id = token.tenant_id;
        (session.user as Record<string, unknown>).user_id = token.user_id;
        (session.user as Record<string, unknown>).session_epoch = token.session_epoch ?? 0;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
