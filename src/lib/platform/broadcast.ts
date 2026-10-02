import sanitizeHtml from "sanitize-html";
import { Types } from "mongoose";
import Tenant from "@/models/Tenant";
import { Broadcast, BroadcastRecipient, IAudienceFilter, IBroadcast, MarketingConsent, Order } from "@/models/platform";
import { formatPKT } from "./db";
import { appUrl, enqueueEmail, escapeHtml, htmlToText } from "./email";
import { ApiError } from "./http";
import { signValue } from "./crypto";
import { normalizeStatus } from "./lifecycle";

export const MAX_BODY_BYTES = 200 * 1024;

/** Allowlist sanitizer for broadcast HTML (architecture §7.7). */
export function sanitizeBroadcastHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "html", "body", "div", "span", "p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "u", "s",
      "small", "sup", "sub", "blockquote", "pre", "code", "ul", "ol", "li", "a", "img", "table", "thead", "tbody", "tfoot",
      "tr", "td", "th", "center", "font", "section", "header", "footer", "style",
    ],
    allowedAttributes: {
      "*": ["style", "align", "valign", "width", "height", "bgcolor", "class", "dir", "border", "cellpadding", "cellspacing", "color", "face", "size"],
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["https"] },
    allowProtocolRelative: false,
    allowVulnerableTags: true, // <style> blocks are allowed for email layout; scripts never are.
    disallowedTagsMode: "discard",
  });
}

export const VARIABLES = ["agency_name", "owner_name", "expiry_date", "days_left", "unsubscribe_url"] as const;

export function unsubscribeUrl(email: string) {
  return appUrl(`/unsubscribe?token=${encodeURIComponent(signValue(`unsub:${email.toLowerCase()}`))}`);
}

export function renderVariables(html: string, vars: Record<string, string>) {
  return html.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k) => (k in vars ? (k === "unsubscribe_url" ? vars[k] : escapeHtml(vars[k])) : m));
}

/** Promotional mail must carry an unsubscribe link — appended if the author left it out. */
export function ensureUnsubscribeFooter(html: string) {
  if (html.includes("{{unsubscribe_url}}") || html.includes("{{ unsubscribe_url }}")) return html;
  const footer = `<p style="font-size:12px;color:#6b7280;text-align:center;margin-top:24px">You are receiving this because you agreed to hear from TripSync. <a href="{{unsubscribe_url}}">Unsubscribe</a></p>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${footer}</body>`) : html + footer;
}

/** Builds the Mongo filter for the audience builder. */
export async function audienceQuery(filter: IAudienceFilter) {
  const q: Record<string, unknown> = {};
  const and: Record<string, unknown>[] = [];
  if (filter.statuses?.length) q.status = { $in: filter.statuses };
  else q.status = { $nin: ["PENDING", "REJECTED", "COLD_STORAGE", "PURGED"] };
  if (filter.sources?.length) q.source = { $in: filter.sources };
  if (filter.sales_owner_id && Types.ObjectId.isValid(filter.sales_owner_id)) q.sales_owner_id = new Types.ObjectId(filter.sales_owner_id);
  if (filter.expiring_within_days) {
    const now = new Date();
    q.access_expires_at = { $gt: now, $lte: new Date(now.getTime() + filter.expiring_within_days * 86_400_000) };
  }
  if (filter.created_from || filter.created_to) {
    const c: Record<string, Date> = {};
    if (filter.created_from) c.$gte = new Date(filter.created_from);
    if (filter.created_to) c.$lte = new Date(`${filter.created_to}T23:59:59.999Z`);
    q.created_at = c;
  }
  if (filter.consent_only) q.marketing_consent = true;
  if (filter.trial_expired_never_paid) {
    const paid = await Order.distinct("agency_id", { status: "APPROVED" });
    and.push({ _id: { $nin: paid } }, { trial_ends_at: { $ne: null, $lte: new Date() } });
  }
  if (and.length) q.$and = and;
  return q;
}

export async function previewAudience(filter: IAudienceFilter, type: IBroadcast["type"]) {
  const q = await audienceQuery(filter);
  const agencies = await Tenant.find(q).select("name owner_email contact_email owner_name status marketing_consent").limit(5000).lean();
  let eligible = 0;
  let skipped = 0;
  const consents = await consentMap(agencies.map((a) => (a.owner_email || a.contact_email || "").toLowerCase()));
  for (const a of agencies) {
    const email = (a.owner_email || a.contact_email || "").toLowerCase();
    if (!email || (type === "PROMOTIONAL" && !isConsented(email, a.marketing_consent, consents))) skipped++;
    else eligible++;
  }
  return {
    total: agencies.length,
    eligible,
    skipped,
    sample: agencies.slice(0, 10).map((a) => ({ id: String(a._id), name: a.name, email: a.owner_email || a.contact_email, status: normalizeStatus(a.status) })),
  };
}

async function consentMap(emails: string[]) {
  const rows = await MarketingConsent.find({ email: { $in: emails.filter(Boolean) } }).select("email marketing_consent unsubscribed_at").lean();
  return new Map(rows.map((r) => [r.email, r]));
}

function isConsented(email: string, agencyFlag: boolean | undefined, map: Map<string, { marketing_consent: boolean; unsubscribed_at: Date | null }>) {
  const c = map.get(email);
  if (c?.unsubscribed_at) return false;
  return Boolean(c?.marketing_consent ?? agencyFlag);
}

/**
 * Expands the audience into recipients + outbox rows in batches. The outbox
 * dispatcher applies the throttle. Idempotent per (broadcast, agency).
 */
export async function expandBroadcast(broadcastId: string) {
  const b = await Broadcast.findOneAndUpdate(
    { _id: broadcastId, status: "SCHEDULED", $or: [{ scheduled_at: null }, { scheduled_at: { $lte: new Date() } }] },
    { $set: { status: "SENDING", started_at: new Date() } },
    { returnDocument: "after" }
  ).lean();
  if (!b) return { expanded: 0 };
  const q = await audienceQuery(b.audience_filter || {});
  const cursor = Tenant.find(q).select("name owner_email contact_email owner_name access_expires_at marketing_consent").lean().cursor();
  let count = 0;
  let batch: Array<{ _id: Types.ObjectId; name: string; owner_email: string; contact_email: string; owner_name: string; access_expires_at: Date | null; marketing_consent: boolean }> = [];
  const flush = async () => {
    const emails = batch.map((a) => (a.owner_email || a.contact_email || "").toLowerCase());
    const consents = await consentMap(emails);
    for (const a of batch) {
      const cur = await Broadcast.findById(b._id).select("status").lean();
      if (cur?.status === "CANCELLED") return false;
      const email = (a.owner_email || a.contact_email || "").toLowerCase();
      let status: "QUEUED" | "SKIPPED" = "QUEUED";
      let skip: string | null = null;
      if (!email) [status, skip] = ["SKIPPED", "NO_EMAIL"];
      else if (b.type === "PROMOTIONAL" && !isConsented(email, a.marketing_consent, consents)) {
        [status, skip] = ["SKIPPED", consents.get(email)?.unsubscribed_at ? "UNSUBSCRIBED" : "NO_CONSENT"];
      }
      const rec = await BroadcastRecipient.findOneAndUpdate(
        { broadcast_id: b._id, agency_id: a._id },
        { $setOnInsert: { email: email || "-", status, skip_reason: skip } },
        { upsert: true, returnDocument: "after" }
      );
      if (status === "QUEUED" && !rec.outbox_id) {
        const days = a.access_expires_at ? Math.max(0, Math.ceil((new Date(a.access_expires_at).getTime() - Date.now()) / 86_400_000)) : "";
        const vars = {
          agency_name: a.name,
          owner_name: a.owner_name || a.name,
          expiry_date: a.access_expires_at ? formatPKT(a.access_expires_at) : "",
          days_left: String(days),
          unsubscribe_url: unsubscribeUrl(email),
        };
        const html = renderVariables(b.html_body, vars);
        const out = await enqueueEmail({
          to: email,
          subject: renderVariables(b.subject, vars).replace(/&amp;/g, "&"),
          html,
          text: renderVariables(b.text_body || htmlToText(b.html_body), vars),
          category: "BROADCAST",
          related_type: "broadcast_recipient",
          related_id: String(rec._id),
          idempotency_key: `broadcast:${b._id}:${a._id}`,
        });
        await BroadcastRecipient.updateOne({ _id: rec._id }, { $set: { outbox_id: out?._id ?? null } });
      }
      count++;
    }
    return true;
  };
  for await (const a of cursor) {
    batch.push(a as unknown as (typeof batch)[number]);
    if (batch.length >= 200) {
      if (!(await flush())) break;
      batch = [];
    }
  }
  if (batch.length) await flush();
  await Broadcast.updateOne({ _id: b._id, status: "SENDING" }, { $set: { recipient_count: count } });
  return { expanded: count };
}

/** Marks SENDING broadcasts SENT once no recipient is still waiting in the outbox. */
export async function finalizeBroadcasts() {
  const sending = await Broadcast.find({ status: "SENDING" }).select("_id").lean();
  for (const b of sending) {
    const queued = await BroadcastRecipient.countDocuments({ broadcast_id: b._id, status: "QUEUED" });
    if (queued === 0) await Broadcast.updateOne({ _id: b._id, status: "SENDING" }, { $set: { status: "SENT", completed_at: new Date() } });
  }
}

/** Cancel: remaining queued recipients are skipped and their outbox rows withdrawn. */
export async function cancelBroadcast(id: string) {
  const { EmailOutbox } = await import("@/models/platform");
  const b = await Broadcast.findOneAndUpdate({ _id: id, status: { $in: ["DRAFT", "SCHEDULED", "SENDING"] } }, { $set: { status: "CANCELLED", completed_at: new Date() } }, { returnDocument: "after" }).lean();
  if (!b) return null;
  const queued = await BroadcastRecipient.find({ broadcast_id: b._id, status: "QUEUED" }).select("outbox_id").lean();
  const outboxIds = queued.map((r) => r.outbox_id).filter(Boolean);
  if (outboxIds.length) await EmailOutbox.updateMany({ _id: { $in: outboxIds }, status: "PENDING" }, { $set: { status: "FAILED", last_error: "Broadcast cancelled" } });
  await BroadcastRecipient.updateMany({ broadcast_id: b._id, status: "QUEUED" }, { $set: { status: "SKIPPED", skip_reason: "CANCELLED" } });
  return b;
}

/** Sanitize on save/send; promotional mail always carries the unsubscribe footer. */
export function prepareBody(b: { html_body?: string; type?: string }) {
  const raw = String(b.html_body || "");
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) throw new ApiError(400, "VALIDATION_ERROR", "Body exceeds 200 KB");
  let html = sanitizeBroadcastHtml(raw);
  if (b.type === "PROMOTIONAL") html = ensureUnsubscribeFooter(html);
  return { html_body: html, text_body: htmlToText(html) };
}
