# TripSync Platform Admin — Implementation Report

| | |
|---|---|
| Based on | `architecture.md` — TripSync Platform Admin Architecture Specification v1.0 |
| Date | 01-10-2026 |
| Stack used | Next.js 16 (App Router) + MongoDB (Mongoose) + NextAuth — the existing TripSync app |
| Status | Code complete; not yet committed or deployed |

---

## 1. Summary

All functional modules of the specification have been built inside the existing TripSync app.

As instructed:
- **No PostgreSQL.** Every table in the spec was rebuilt as a MongoDB collection (prefixed `platform_`).
- **No NestJS or pg-boss.** The existing Next.js API routes were extended instead.
- **Existing API routes keep working.** New routes follow the same pattern:
  - `/api/admin/*` — staff
  - `/api/tenant/*` — agency users
  - `/api/public/*` — public forms

**Legend**

| Mark | Meaning |
|---|---|
| ✅ | Done |
| 🟡 | Done, but differs from the spec (reason given) |
| ⏳ | Not done in this round |

---

## 2. What was implemented from the specification

### §4 Identity and permissions

| Item | Status | Notes |
|---|---|---|
| Roles: Super Admin, Manager, Sales Executive | ✅ | Full permission matrix (§4.2) in one file: `src/lib/platform/permissions.ts` |
| Permission keys (§4.4) | ✅ | Every staff endpoint checks a named permission |
| Sales Executive row scoping (§4.3) | ✅ | Sees only own agencies, orders, tickets and earner record |
| Privacy rule: no agency business data for staff | ✅ | Agency detail page shows account-level data only |
| TOTP 2FA, required for Super Admin and Manager | ✅ | Can be switched off in Settings → Security |
| Lockout after 5 failed logins (15 min) | ✅ | |
| Password reset by email link (single-use, 60 min) | ✅ | `/set-password` |
| Separate `platform_users` table | 🟡 | Kept the existing `users` collection so the current login keeps working. Staff and agency users are separated by role, and each API rejects the other side. |
| Refresh tokens, CSRF, cookie names | 🟡 | Existing NextAuth session handling is used. Deactivated staff are blocked on every request; agency sessions are killed instantly through `session_epoch`. |

### §5 Agency lifecycle

| Item | Status | Notes |
|---|---|---|
| States: PENDING, REJECTED, TRIAL, ACTIVE, EXPIRED, SUSPENDED, OFFBOARDED, COLD_STORAGE, PURGED | ✅ | Old values Active/Suspended/Expired are migrated automatically at server start |
| `getEffectiveStatus` — no access after expiry even if the job is late | ✅ | |
| Suspend pauses the clock; activate shifts expiry by the suspended time | ✅ | |
| Offboard with reason and retention months | ✅ | |
| Restore read-only (OFFBOARDED → EXPIRED) | ✅ | |
| Complimentary extension (Super Admin, reason required) | ✅ | |
| One trial per email / phone / business name | ✅ | |
| Access matrix (§5.3) and locked messages after correct credentials only | ✅ | |

### §6 Access enforcement in the agency app

| Item | Status | Notes |
|---|---|---|
| Maintenance guard → 503 MAINTENANCE | ✅ | Admin and public pages stay up |
| Session epoch check | ✅ | |
| EXPIRED = read-only, default-deny for any write | ✅ | Applied to **all** existing agency APIs through the shared `withAuth` helper |
| `@AllowWhenExpired` equivalent | ✅ | All `/api/tenant/*` routes, login and export (GET) routes |
| Expired banner + Renew button | ✅ | |
| Locked full-screen page (suspended / offboarded) | ✅ | Shows support WhatsApp and email |
| Maintenance full-screen page | ✅ | |
| Upcoming-maintenance banner | ✅ | |
| Expiry banner when ≤ 21 days remain | ✅ | |
| Hide create/edit buttons on existing pages when expired | ⏳ | Backend already blocks writes; the buttons are still visible |

### §7 Modules

| # | Module | Status | What is included |
|---|---|---|---|
| 7.1 | Overview | 🟡 | Revenue, cash pending (by method and collector), new agencies by source, trials and conversion, status counts, expiring 7/14/30, churn, discounts, commissions, costs, net, run-rate, by salesperson/affiliate, daily revenue chart, CSV export. Sales Executives see their own numbers. **Difference:** numbers are calculated live; no nightly `daily_metrics` table. |
| 7.2 | Agencies | ✅ | Server-side search, filters and pagination; new columns (plan, branches, source, sales owner, last active); "Paused — N days remaining"; create trial; detail page with profile, periods, orders, receipts, tickets, users, timeline; edit profile; set limits; assign sales owner; CSV export |
| 7.3 | Orders | ✅ | Pending / All / Subscriptions tabs; order types and statuses; staff order entry with live quote; price snapshot stored on the order; `ORD-000001` numbers and 8-character payment reference; duplicate flag; self-collected orders auto-approved. **Approval** is one transaction: agency, period, receipt, commission, audit and email. **Also:** reject, reverse (voids receipt, negative commission), resend receipt, cancel, printable receipt. |
| 7.4 | Pricing & Promotions | ✅ | Versioned, immutable price books; campaigns; promo codes (percent/flat, first order only, once per agency, max redemptions, dates); sequential stacking; Super Admin manual adjustment; prorated upgrade; one pricing engine for all quotes; unified promotions list with CSV. The worked example (34,020) matches. |
| 7.5 | Affiliates & Sales Team | ✅ | Earners (Sales Executive + affiliate); create affiliate with commission % and first promo code in one form; first-payment vs all-payments scope; commission accrues on approval and reverses with the order; manual payouts that settle oldest entries first |
| 7.6 | Support | ✅ | Agency creates tickets and chats; staff inbox with filters, unread markers and "waiting since"; routing to sales owner; reassign; categories, priorities, statuses; reopen on reply; auto-close after 7 days; plain text, 4,000 chars, 30 messages/hour; polling (agency 30 s, staff 20 s); email notifications |
| 7.7 | Broadcast | ✅ | HTML editor with sandboxed live preview; variables; HTML sanitizing; promotional (consent only, unsubscribe link auto-added) vs operational; audience builder incl. "trial expired, never paid"; audience preview; send test; send now or schedule; throttled; per-recipient status; retry failed; cancel |
| 7.8 | Maintenance | ✅ | Schedule window in PKT; banner start time; optional broadcast draft; edit, cancel, start now, end now; overlap check; > 24 h needs a reason |
| 7.9 | Archive | 🟡 | Retention grid; extend retention; manual snapshot; warnings at 30 and 7 days; snapshot → verify (checksum + row counts) → release live rows; RETAIN / DELETE (type agency name to confirm); restore with original IDs. **Difference:** snapshots are encrypted files on the server disk, not S3. |
| 7.10 | Platform Costs | ✅ | Add, edit, void (never delete); categories; recurring monthly entries; commission payouts included in totals; CSV |
| 7.11 | Team | ✅ | Invite by email; roles; deactivate (never delete); reset password; reset 2FA; unlock; Sales Executive gets an earner record automatically; reassign agencies when deactivating |
| 7.12 | Audit Log | ✅ | Every write action logged with actor, before/after, reason, IP, request ID; secrets redacted; append-only; filters; per-agency timeline; CSV export |
| 7.13 | Settings | ✅ | All keys from the spec (SMTP with test button, sender, throttle, support contact, payment details, trial days, reminder offsets, retention, locked messages, receipt/tax, notification toggles) plus a 2FA on/off switch; secrets stored encrypted; Managers view only |
| 7.14 | Public flows | ✅ | `/trial` self-serve trial with separate data and marketing consent; `/buy` purchase form with live price, payment details, QR and WhatsApp link; set-password; unsubscribe; rate limit, honeypot, email MX check, optional captcha |

### §8 Flows, §11 Emails, §12 Background jobs

| Item | Status | Notes |
|---|---|---|
| Paid order → WhatsApp verification → approval | ✅ | |
| Sales Executive cash sale → pending → approval | ✅ | |
| Expiry reminders at 21 d / 14 d / 7 d / 24 h, once each | ✅ | Skipped when a pending renewal exists |
| Email outbox with retries, idempotency and throttle | ✅ | A failed email never cancels an approval |
| All emails in the §11 table | ✅ | Receipt is HTML; no PDF attachment yet |
| Jobs: outbox, expiry sweep, reminders, broadcast, maintenance, ticket auto-close, retention sweep, recurring costs, token cleanup | ✅ | Run inside the Node server. Each job is locked in the database so it never runs twice. Super Admin is alerted after 3 failures. Run-now button in Settings → Jobs. |
| `metrics-rollup` job | ⏳ | Not needed; Overview is computed live |

### §9 Data model

All entities were created as MongoDB collections with the same field names. `docs/reconciliation.md` has the full mapping.

Two existing fields were reused instead of renamed (the spec says "do not rename"):

| Spec name | Existing field used |
|---|---|
| `expires_at` | `access_expires_at` |
| `seat_limit` | `max_users` |

### Non-negotiables (§0)

| # | Rule | Status |
|---|---|---|
| N1 | Agency ID from token only | ✅ |
| N2 | Append-only audit, written in the same transaction | ✅ (enforced in code; also add a DB user without update/delete rights in production) |
| N3 | Default-deny for expired agencies | ✅ |
| N4 | Data destroyed only through Archive by Super Admin after a verified snapshot | ✅ |
| N5 | Server-side whole-PKR math, half-up rounding | ✅ |
| N6 | Idempotent, atomic approval | ✅ (needs MongoDB Atlas or a replica set) |
| N7 | Gapless receipt numbers | ✅ |
| N8 | UTC storage, PKT display, DD-MM-YYYY | ✅ |
| N9 | Emails only through the outbox | ✅ |
| N10 | No file attachments | ✅ |

### Not done in this round

- Hiding create/edit buttons on the old agency pages for expired agencies (backend already blocks them).
- Branch entity in the agency app — "branches used" always shows 1 until branches exist.
- PDF receipt attachment (HTML receipt + "Print / Save PDF" page instead).
- Automated test suite for the §16 acceptance tests.
- Everything listed as "Deferred" in §15 of the spec.

---

## 3. Environment variables (`.env` on the live server)

### Already present — keep them

| Variable | Note |
|---|---|
| `MONGODB_URI` | Must be MongoDB Atlas or a replica set (needed for transactions) |
| `NEXTAUTH_SECRET` | **Must be a strong random value on live** (currently a placeholder) |
| `NEXTAUTH_URL` | The live URL |

### New — required

| Variable | Purpose | How to create |
|---|---|---|
| `PLATFORM_ENCRYPTION_KEY` | Encrypts the SMTP password, 2FA secrets and archive files | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

> ⚠️ Set `PLATFORM_ENCRYPTION_KEY` **before** anyone turns on 2FA or saves SMTP settings, and **never change it**. If it changes, the saved SMTP password, all 2FA setups and existing archive files can no longer be decrypted.

### New — recommended / optional

| Variable | Purpose | Default if not set |
|---|---|---|
| `APP_URL` | Base URL used in email links (e.g. `https://app.tripsync.pk`) | `NEXTAUTH_URL` |
| `ARCHIVE_DIR` | Folder for cold-storage snapshot files (must be included in backups) | `./storage/archives` |
| `TURNSTILE_SECRET_KEY` | Enables Cloudflare Turnstile captcha on `/trial` and `/buy` | Captcha off |
| `PLATFORM_JOBS` | Set to `off` on extra servers so background jobs run on only one | Jobs on |

### Example

```env
MONGODB_URI=mongodb+srv://...
NEXTAUTH_SECRET=<strong-random-value>
NEXTAUTH_URL=https://app.tripsync.pk
PLATFORM_ENCRYPTION_KEY=<64-hex-characters>
APP_URL=https://app.tripsync.pk
ARCHIVE_DIR=/var/tripsync/archives
# TURNSTILE_SECRET_KEY=
# PLATFORM_JOBS=off
```

---

## 4. Server requirements for going live

| Requirement | Detail |
|---|---|
| Long-running Node server | VPS, PM2 or Docker. Serverless hosting (e.g. Vercel) will not run the background jobs. |
| One job runner | With multiple instances, set `PLATFORM_JOBS=off` on all but one. |
| MongoDB | Atlas or a replica set (transactions). |
| Install packages | Run `npm install` — new packages: `nodemailer`, `sanitize-html`. |
| Backups | Daily database backups, plus the `ARCHIVE_DIR` folder. Snapshots are not backups. |
| Email DNS | SPF, DKIM and DMARC on the sending domain, otherwise emails go to spam. |

---

## 5. Information needed from the business (entered in Admin → Settings, not in `.env`)

| Setting | Details needed |
|---|---|
| SMTP | Host, port, TLS yes/no, username, password |
| Sender | No-reply address and display name |
| Email throttle | Messages per minute / hour allowed by the SMTP provider |
| Support contact | Support WhatsApp number (with country code), support email |
| Payment details | Bank name, account title, account number, IBAN, QR image link (https) |
| Receipt | Seller name and address; NTN and tax rate only after the accountant confirms |
| Pricing (Pricing page) | Base monthly fee, included users and branches, extra user rate, extra branch rate |
| Optional | Trial length (default 7 days), reminder schedule, retention months (default 12), locked-screen messages |

---

## 6. First steps after deployment

1. Set `PLATFORM_ENCRYPTION_KEY` (and a real `NEXTAUTH_SECRET`), then start the server.
2. Sign in as Super Admin and set up 2FA (Security page).
3. Fill in Settings: SMTP (use "Send test email"), support contact and payment details.
4. Create the first price book on the Pricing page. Orders and quotes need it.
5. Invite Managers and Sales Executives from Team.
6. Check Settings → Jobs & outbox to confirm the jobs are running.
