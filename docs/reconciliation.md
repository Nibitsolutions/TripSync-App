# Platform Admin — reconciliation (spec → this codebase)

The architecture spec assumes NestJS + PostgreSQL + pg-boss. This app is **Next.js (App Router) + MongoDB (Mongoose) + NextAuth**. The functionality was built on the existing stack; this file maps every spec name to the real code and records each deviation.

## Stack mapping

| Spec | Here |
|---|---|
| NestJS module `src/platform/*` | `src/lib/platform/*` (domain services) + Next route handlers |
| `/api/platform/v1` (staff) | `/api/admin/*` (the existing admin prefix, kept) |
| `/api/tenant/v1` (agency users) | `/api/tenant/*` |
| `/api/public/v1` | `/api/public/*` |
| PostgreSQL schema `platform` | MongoDB collections prefixed `platform_` (`src/models/platform/*`) |
| Transactions | `withTxn()` in `lib/platform/db.ts` — Mongo multi-document transactions (Atlas / replica set). Falls back to no transaction on a standalone server (dev only). |
| `SELECT … FOR UPDATE` | atomic `findOneAndUpdate({ status: "PENDING" })` claim inside the transaction |
| Receipt counter (`receipt_counters`) | `platform_counters` (`order`, `receipt`, `ticket`), `$inc` inside the transaction → gapless |
| RLS on agency-facing tables | every tenant route filters by `agency_id` from the session token (`withTenant`), never client input |
| `REVOKE UPDATE/DELETE` + trigger on `audit_logs` | Mongoose hooks throw on every update/delete op on `PlatformAuditLog` (app-level; add a DB role without update/delete rights in production for DB-level enforcement) |
| pg-boss workers | `lib/platform/jobs.ts`, started from `src/instrumentation.ts`; Mongo lock per job in `platform_job_state` so multiple instances never double-run |
| `daily_metrics` rollup | Not created — Overview is computed live with indexed aggregations (`lib/platform/metrics.ts`). Add a rollup if order volume grows large. |
| S3 cold storage | Encrypted (AES-256-GCM) gzip NDJSON snapshots on disk at `ARCHIVE_DIR` (default `./storage/archives`). Swap `archive.ts` read/write for an S3 client to move to object storage. |
| `otplib` | `lib/platform/totp.ts` (RFC 6238, no dependency) |
| argon2id | bcrypt (existing app choice, kept so existing passwords keep working) |
| `sanitize-html`, Nodemailer | added as dependencies |
| Cloudflare Turnstile | optional — enabled when `TURNSTILE_SECRET_KEY` is set |

## Entity mapping

| Spec | Model / collection | Notes |
|---|---|---|
| `agencies` | `Tenant` / `tenants` (extended in place) | `expires_at` = existing `access_expires_at`; `seat_limit` = existing `max_users` (not renamed). New fields added only. |
| `agencies.status` | `Tenant.status` | Legacy `Active/Suspended/Expired` migrated to `ACTIVE/SUSPENDED/EXPIRED` automatically at server start (`migrateLegacyTenants`). |
| `platform_users` | `User` / `users` with roles `SuperAdmin`, `Manager`, `SalesExecutive` (`tenant_id = null`) | **Conflict:** spec wants a separate table. Kept one `users` collection so the existing NextAuth login keeps working; platform vs agency is decided by role, and every staff endpoint rejects agency roles and vice versa. |
| `platform_refresh_tokens` | — | NextAuth JWT sessions are used; deactivation is enforced on every staff request (`is_active` check) and agency sessions are killed via `session_epoch`. |
| `audit_logs` | `PlatformAuditLog` / `platform_audit_logs` | The existing per-field `AuditLog` (agency business data) is untouched. |
| `settings` | `PlatformSetting` / `platform_settings` | Defaults in `lib/platform/settings.ts`. Extra key `security.enforce_2fa`. |
| `price_books`, `campaigns`, `promo_codes` | `PriceBook`, `Campaign`, `PromoCode` | Price books immutable (update hooks throw). |
| `orders`, `subscription_periods`, `receipts` | `PlatformOrder`, `SubscriptionPeriod`, `PlatformReceipt` | Named `Platform*` to avoid clashing with the agency app's own models. |
| `commission_earners`, `commission_entries`, `commission_payouts` | same names | The agency app's `Commission` model is unrelated and untouched. |
| `support_tickets`, `support_messages` | same names | Messages append-only (update hooks throw). |
| `email_outbox`, `broadcasts`, `broadcast_recipients`, `expiry_reminders_sent`, `maintenance_windows` | same names | |
| `platform_costs`, `tenant_archives`, `marketing_consents` | same names | |
| set-password / reset tokens | `AuthToken` / `platform_auth_tokens` | sha256-hashed, single-use |

## Guards (spec §6)

* `src/proxy.ts` forwards the request method/path to route handlers.
* `withAuth` (existing helper used by every agency route) now runs `enforceTenantAccess`: maintenance → session epoch → effective status → **default-deny** for mutating requests when `EXPIRED`.
* `/api/tenant/*` routes use `withTenant` = `@AllowWhenExpired`.
* Existing agency export/report endpoints are `GET`, so they keep working while expired.
* Login: `EXPIRED` can sign in (read-only); `SUSPENDED` / `OFFBOARDED` get the locked message after correct credentials; staff accounts lock for 15 min after 5 failures; TOTP step when enabled.

## Not done / differences to know

* The agency app shows the expired banner and the backend blocks writes, but individual create/edit buttons in existing pages are not hidden yet.
* Branches: the agency app has no branch entity yet, so "branches used" is always 1. Limits are stored and priced.
* The receipt is HTML (email + printable page with Save as PDF); no server-side PDF.
* Receipt PDF attachment, impersonation, payment gateway, etc. remain deferred per spec §15.

## Environment variables

| Variable | Purpose |
|---|---|
| `PLATFORM_ENCRYPTION_KEY` | 32-byte key (hex or base64) for SMTP password, TOTP secrets, archives. **Set in production** — falls back to a key derived from `NEXTAUTH_SECRET`. |
| `APP_URL` | Base URL used in email links (falls back to `NEXTAUTH_URL`). |
| `ARCHIVE_DIR` | Where cold-storage snapshots are written. |
| `TURNSTILE_SECRET_KEY` | Enables captcha verification on public forms. |
| `PLATFORM_JOBS=off` | Disable the in-process scheduler (e.g. on extra instances). |
