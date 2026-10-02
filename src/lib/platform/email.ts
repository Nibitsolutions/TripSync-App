import nodemailer from "nodemailer";
import { ClientSession } from "mongoose";
import { EmailOutbox, IEmailOutbox } from "@/models/platform";
import { getSetting } from "./settings";
import { sessionOpt, formatPKR, formatPKT } from "./db";

export function appUrl(path = "") {
  const base = (process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Standard transactional layout with the "do not reply" footer (§11). */
export async function emailLayout(title: string, bodyHtml: string): Promise<string> {
  const support = await getSetting("support_contact");
  const contact = [support.whatsapp && `WhatsApp ${escapeHtml(support.whatsapp)}`, support.email && escapeHtml(support.email)]
    .filter(Boolean)
    .join(" · ");
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="background:#111827;color:#ffffff;padding:18px 24px;font-size:18px;font-weight:bold">TripSync</td></tr>
<tr><td style="padding:24px"><h2 style="margin:0 0 16px;font-size:18px">${escapeHtml(title)}</h2>${bodyHtml}</td></tr>
<tr><td style="padding:16px 24px;background:#f9fafb;font-size:12px;color:#6b7280">This is an automated message — please do not reply.${contact ? ` For help contact support: ${contact}.` : ""}</td></tr>
</table></td></tr></table></body></html>`;
}

export function button(href: string, label: string) {
  return `<p style="margin:20px 0"><a href="${escapeHtml(href)}" style="background:#dc2626;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">${escapeHtml(label)}</a></p>`;
}

export interface EnqueueInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  category: IEmailOutbox["category"];
  related_type?: string | null;
  related_id?: string | null;
  idempotency_key: string;
}

/**
 * Queue an email. Runs inside the caller's transaction so the email exists iff
 * the business change commits; sending happens later in the dispatcher (N9).
 * Duplicate idempotency keys are ignored.
 */
export async function enqueueEmail(input: EnqueueInput, session: ClientSession | null = null) {
  if (!input.to) return null;
  const doc = {
    to_email: input.to.trim().toLowerCase(),
    subject: input.subject,
    html: input.html,
    text: input.text ?? htmlToText(input.html),
    category: input.category,
    related_type: input.related_type ?? null,
    related_id: input.related_id ?? null,
    idempotency_key: input.idempotency_key,
    status: "PENDING",
    attempts: 0,
    next_attempt_at: new Date(),
  };
  const res = await EmailOutbox.findOneAndUpdate(
    { idempotency_key: input.idempotency_key },
    { $setOnInsert: doc },
    { upsert: true, returnDocument: "after", ...sessionOpt(session) }
  ).lean();
  return res;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
let transportCache: { key: string; transport: nodemailer.Transporter } | null = null;

async function getTransport() {
  const smtp = await getSetting("smtp");
  if (!smtp.host) return null;
  const key = JSON.stringify([smtp.host, smtp.port, smtp.secure, smtp.username, smtp.password]);
  if (transportCache?.key === key) return transportCache.transport;
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port) || 587,
    secure: Boolean(smtp.secure),
    auth: smtp.username ? { user: smtp.username, pass: smtp.password } : undefined,
    pool: true,
    maxConnections: 2,
  });
  transportCache = { key, transport };
  return transport;
}

async function fromHeader() {
  const from = await getSetting("email_from");
  const support = await getSetting("support_contact");
  return {
    from: from.name ? `"${from.name.replace(/"/g, "")}" <${from.address}>` : from.address,
    replyTo: from.reply_to || support.email || undefined,
  };
}

/** Send one message immediately (SMTP test / "send test to me"). */
export async function sendDirect(to: string, subject: string, html: string) {
  const transport = await getTransport();
  if (!transport) throw new Error("SMTP is not configured (Settings → SMTP)");
  const { from, replyTo } = await fromHeader();
  await transport.sendMail({ from, replyTo, to, subject, html, text: htmlToText(html) });
}

const BACKOFF_MIN = [1, 5, 15, 60, 240];
const MAX_ATTEMPTS = 5;
const STALE_MS = 3 * 86_400_000;

/** Sends due PENDING rows while respecting the throttle (Settings `email_throttle`). */
export async function dispatchOutbox(): Promise<{ sent: number; failed: number; skipped?: string }> {
  // Don't flush a backlog of stale mail when SMTP is configured late (e.g. old reminders).
  // Stale receipts become FAILED so the order shows "Resend receipt".
  const staleRows = await EmailOutbox.find({ status: "PENDING", created_at: { $lt: new Date(Date.now() - STALE_MS) } }).limit(500).lean();
  for (const row of staleRows) {
    await EmailOutbox.updateOne({ _id: row._id, status: "PENDING" }, { $set: { status: "FAILED", last_error: "Not sent within 3 days (stale)" } });
    await onOutboxResult(row, "FAILED");
  }

  const transport = await getTransport();
  if (!transport) return { sent: 0, failed: 0, skipped: "SMTP not configured" };
  const throttle = await getSetting("email_throttle");
  const now = new Date();
  const [lastMinute, lastHour] = await Promise.all([
    EmailOutbox.countDocuments({ status: "SENT", sent_at: { $gte: new Date(now.getTime() - 60_000) } }),
    EmailOutbox.countDocuments({ status: "SENT", sent_at: { $gte: new Date(now.getTime() - 3_600_000) } }),
  ]);
  const budget = Math.max(0, Math.min(throttle.per_minute - lastMinute, throttle.per_hour - lastHour));
  if (budget === 0) return { sent: 0, failed: 0, skipped: "throttled" };

  // Recover rows stuck in SENDING (crash mid-send) after 10 minutes.
  await EmailOutbox.updateMany(
    { status: "SENDING", next_attempt_at: { $lt: new Date(now.getTime() - 600_000) } },
    { $set: { status: "PENDING" } }
  );

  const { from, replyTo } = await fromHeader();
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < budget; i++) {
    const row = await EmailOutbox.findOneAndUpdate(
      { status: "PENDING", next_attempt_at: { $lte: new Date() } },
      { $set: { status: "SENDING", next_attempt_at: new Date() }, $inc: { attempts: 1 } },
      { sort: { next_attempt_at: 1 }, returnDocument: "after" }
    ).lean();
    if (!row) break;
    try {
      await transport.sendMail({ from, replyTo, to: row.to_email, subject: row.subject, html: row.html, text: row.text });
      await EmailOutbox.updateOne({ _id: row._id }, { $set: { status: "SENT", sent_at: new Date(), last_error: null } });
      sent++;
      await onOutboxResult(row, "SENT");
    } catch (err) {
      const msg = (err as Error).message?.slice(0, 500) || "send failed";
      const finalFail = row.attempts >= MAX_ATTEMPTS;
      await EmailOutbox.updateOne(
        { _id: row._id },
        {
          $set: {
            status: finalFail ? "FAILED" : "PENDING",
            last_error: msg,
            next_attempt_at: new Date(Date.now() + BACKOFF_MIN[Math.min(row.attempts - 1, BACKOFF_MIN.length - 1)] * 60_000),
          },
        }
      );
      failed++;
      if (finalFail) await onOutboxResult(row, "FAILED");
    }
  }
  return { sent, failed };
}

/** Mirror final outbox status onto the related record (receipt email / broadcast recipient). */
async function onOutboxResult(row: IEmailOutbox, status: "SENT" | "FAILED") {
  const { Order, BroadcastRecipient } = await import("@/models/platform");
  if (row.related_type === "order_receipt" && row.related_id) {
    await Order.updateOne({ _id: row.related_id }, { $set: { receipt_email_status: status } });
  }
  if (row.related_type === "broadcast_recipient" && row.related_id) {
    await BroadcastRecipient.updateOne({ _id: row.related_id }, { $set: { status } });
  }
}

// ---------------------------------------------------------------------------
// Templates (§11)
// ---------------------------------------------------------------------------
export const templates = {
  async setPassword(name: string, link: string, context: "trial" | "welcome" | "invite") {
    const intro =
      context === "trial"
        ? "Your TripSync free trial is ready. Verify your email and choose a password to get started."
        : context === "welcome"
          ? "Your TripSync subscription is active. Choose a password to sign in to your agency account."
          : "You have been invited to the TripSync platform team. Choose a password to activate your account.";
    return {
      subject: context === "invite" ? "You're invited to TripSync" : "Set your TripSync password",
      html: await emailLayout(
        "Set your password",
        `<p>Hi ${escapeHtml(name)},</p><p>${intro}</p>${button(link, "Set password")}<p style="font-size:12px;color:#6b7280">This link can be used once and expires in 72 hours.</p>`
      ),
    };
  },
  async passwordReset(name: string, link: string) {
    return {
      subject: "Reset your TripSync password",
      html: await emailLayout(
        "Password reset",
        `<p>Hi ${escapeHtml(name)},</p><p>We received a request to reset your password.</p>${button(link, "Reset password")}<p style="font-size:12px;color:#6b7280">This link can be used once and expires in 60 minutes. If you did not request it, ignore this email.</p>`
      ),
    };
  },
  async orderReceived(o: { order_number: string; payment_reference: string; total_due: number; agency_name: string }) {
    const pay = await getSetting("payment_instructions");
    const support = await getSetting("support_contact");
    const payLines = [
      pay.bank_name && `Bank: ${escapeHtml(pay.bank_name)}`,
      pay.account_title && `Account title: ${escapeHtml(pay.account_title)}`,
      pay.account_number && `Account number: ${escapeHtml(pay.account_number)}`,
      pay.iban && `IBAN: ${escapeHtml(pay.iban)}`,
    ].filter(Boolean);
    return {
      subject: `Order ${o.order_number} received — reference ${o.payment_reference}`,
      html: await emailLayout(
        "We received your order",
        `<p>Thank you, ${escapeHtml(o.agency_name)}. Your order <b>${escapeHtml(o.order_number)}</b> is pending payment verification.</p>
<p>Amount due: <b>${formatPKR(o.total_due)}</b><br/>Payment reference: <b style="font-family:monospace;font-size:16px">${escapeHtml(o.payment_reference)}</b></p>
${payLines.length ? `<p>${payLines.join("<br/>")}</p>` : ""}
<p>After paying, send the payment screenshot with your reference${support.whatsapp ? ` on WhatsApp to <b>${escapeHtml(support.whatsapp)}</b>` : " to our support team"}. We will activate your account after verification.</p>`
      ),
    };
  },
  async orderRejected(o: { order_number: string; reason: string }) {
    return {
      subject: `Order ${o.order_number} could not be approved`,
      html: await emailLayout(
        "Order not approved",
        `<p>Your order <b>${escapeHtml(o.order_number)}</b> could not be approved.</p><p>Reason: ${escapeHtml(o.reason)}</p><p>Please contact support if you have any questions.</p>`
      ),
    };
  },
  async receipt(r: {
    receipt_number: string;
    issued_at: Date;
    agency_name: string;
    lines: { label: string; amount: number }[];
    total: number;
    details: Record<string, unknown>;
  }) {
    const tax = await getSetting("receipt_tax");
    const rows = r.lines
      .map(
        (l) =>
          `<tr><td style="padding:6px 0;border-bottom:1px solid #f3f4f6">${escapeHtml(l.label)}</td><td align="right" style="padding:6px 0;border-bottom:1px solid #f3f4f6">${formatPKR(l.amount)}</td></tr>`
      )
      .join("");
    const d = r.details;
    return {
      subject: `Receipt ${r.receipt_number}`,
      html: await emailLayout(
        `Receipt ${r.receipt_number}`,
        `<p style="font-size:12px;color:#6b7280">${escapeHtml(tax.seller_name)}${tax.seller_address ? `<br/>${escapeHtml(tax.seller_address)}` : ""}${tax.enabled && tax.seller_ntn ? `<br/>NTN: ${escapeHtml(tax.seller_ntn)}` : ""}</p>
<p>Date: ${formatPKT(r.issued_at)}<br/>Agency: <b>${escapeHtml(r.agency_name)}</b><br/>Plan: ${escapeHtml(d.seats)} seats, ${escapeHtml(d.branches)} branches${d.period ? `<br/>Period: ${escapeHtml(d.period)}` : ""}</p>
<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${rows}<tr><td style="padding:10px 0;font-weight:bold">Total</td><td align="right" style="padding:10px 0;font-weight:bold">${formatPKR(r.total)}</td></tr></table>
<p style="font-size:12px;color:#6b7280">Payment method: ${escapeHtml(d.payment_method)} · Reference: ${escapeHtml(d.payment_reference)} · Order: ${escapeHtml(d.order_number)}</p>`
      ),
    };
  },
  async expiryReminder(agency: string, expires: Date, isTrial: boolean) {
    const days = Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 86_400_000));
    return {
      subject: isTrial ? "Your TripSync trial ends soon" : `Your TripSync subscription expires in ${days} day${days === 1 ? "" : "s"}`,
      html: await emailLayout(
        isTrial ? "Trial ending soon" : "Subscription expiring",
        `<p>Hi ${escapeHtml(agency)},</p><p>Your ${isTrial ? "free trial" : "subscription"} ends on <b>${formatPKT(expires)}</b>. Renew now to keep full access without interruption.</p>${button(appUrl("/dashboard/subscription"), "Renew now")}`
      ),
    };
  },
  async expired(agency: string) {
    return {
      subject: "Your TripSync subscription has expired",
      html: await emailLayout(
        "Subscription expired",
        `<p>Hi ${escapeHtml(agency)},</p><p>Your subscription has expired. You can still sign in, view and export your data. Renew to restore full access.</p>${button(appUrl("/dashboard/subscription"), "Renew")}`
      ),
    };
  },
  async lifecycle(kind: "suspended" | "offboarded" | "reactivated", agency: string) {
    const locked = await getSetting("locked_messages");
    const text =
      kind === "suspended" ? locked.suspended : kind === "offboarded" ? locked.offboarded : "Your TripSync account has been reactivated. You can sign in again.";
    return {
      subject: kind === "reactivated" ? "Your TripSync account is active again" : `Your TripSync account has been ${kind}`,
      html: await emailLayout(kind === "reactivated" ? "Account reactivated" : "Account update", `<p>Hi ${escapeHtml(agency)},</p><p>${escapeHtml(text)}</p>`),
    };
  },
  async ticketNew(t: { ticket_number: string; subject: string; agency_name: string }) {
    return {
      subject: `New support ticket ${t.ticket_number}: ${t.subject}`,
      html: await emailLayout(
        "New support ticket",
        `<p><b>${escapeHtml(t.agency_name)}</b> opened ticket <b>${escapeHtml(t.ticket_number)}</b>: ${escapeHtml(t.subject)}</p>${button(appUrl("/admin/support"), "Open inbox")}`
      ),
    };
  },
  async ticketReply(t: { ticket_number: string; subject: string }) {
    return {
      subject: `Support replied to ${t.ticket_number}`,
      html: await emailLayout(
        "New reply on your ticket",
        `<p>Our team replied to your ticket <b>${escapeHtml(t.ticket_number)}</b> (${escapeHtml(t.subject)}).</p>${button(appUrl("/dashboard/support"), "View conversation")}`
      ),
    };
  },
  async systemAlert(title: string, message: string) {
    return { subject: `[TripSync alert] ${title}`, html: await emailLayout(title, `<p>${escapeHtml(message)}</p>`) };
  },
};
