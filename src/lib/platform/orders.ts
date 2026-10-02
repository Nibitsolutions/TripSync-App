import { ClientSession, Types } from "mongoose";
import Tenant, { ITenant } from "@/models/Tenant";
import User from "@/models/User";
import {
  CommissionEarner,
  CommissionEntry,
  IOrder,
  Order,
  OrderType,
  PromoCode,
  Receipt,
  SubscriptionPeriod,
} from "@/models/platform";
import { ApiError, PlatformContext, RequestMeta } from "./http";
import { platformActor, systemActor, writeAudit } from "./audit";
import { addMonths, formatNumber, formatPKT, nextNumber, roundHalfUp, sessionOpt, withTxn } from "./db";
import { randomReference } from "./crypto";
import { enqueueEmail, templates } from "./email";
import { findDuplicateAgency, getEffectiveStatus, invalidateAgency, normalizeStatus, provisionOwner, recordConsent } from "./lifecycle";
import { orderTypeFor, quote } from "./pricing";

export type OrderActor =
  | { kind: "platform"; ctx: PlatformContext }
  | { kind: "agency"; user_id: string; name: string; role: string; agency_id: string; meta: RequestMeta }
  | { kind: "public"; meta: RequestMeta };

export interface CreateOrderInput {
  agency_id?: string | null;
  new_agency?: {
    business_name: string;
    owner_name: string;
    owner_email: string;
    owner_phone?: string;
    business_phone?: string;
    business_email?: string;
    business_address?: string;
    data_consent?: boolean;
    marketing_consent?: boolean;
  } | null;
  upgrade?: boolean;
  seats: number;
  branches: number;
  term_quarters: number;
  promo_code?: string | null;
  payment_method?: "BANK_TRANSFER" | "CASH";
  amount_received?: number | null;
  collected_by?: string | null;
  collected_at?: string | Date | null;
  payment_note?: string;
  manual_adjustment?: number;
  adjustment_reason?: string | null;
  amount_override_reason?: string | null;
}

function auditActorFor(actor: OrderActor) {
  if (actor.kind === "platform") return platformActor(actor.ctx);
  if (actor.kind === "agency") return { kind: "agency" as const, user_id: actor.user_id, name: actor.name, role: actor.role, meta: actor.meta };
  return { kind: "public" as const, meta: actor.meta };
}

async function uniqueReference(session: ClientSession | null) {
  for (let i = 0; i < 10; i++) {
    const ref = randomReference(8);
    if (!(await Order.exists({ payment_reference: ref }).session(session))) return ref;
  }
  throw new ApiError(500, "INTERNAL_ERROR", "Could not allocate a payment reference");
}

/** Creates an order (PENDING). Staff orders collected by a Manager / Super Admin themselves are auto-approved. */
export async function createOrder(actor: OrderActor, input: CreateOrderInput) {
  const isStaff = actor.kind === "platform";
  const role = isStaff ? actor.ctx.user.role : null;

  if (input.manual_adjustment && role !== "SuperAdmin") throw new ApiError(403, "FORBIDDEN", "Only Super Admin can apply a manual adjustment");
  if (input.manual_adjustment && !(input.adjustment_reason || "").trim()) throw new ApiError(400, "REASON_REQUIRED", "Adjustment reason is required");

  const created = await withTxn(async (session) => {
    let agency: ITenant | null = null;
    let type: OrderType;
    let possibleDuplicate = false;
    let salesOwner: Types.ObjectId | null = null;

    if (input.agency_id) {
      agency = await Tenant.findById(input.agency_id).session(session);
      if (!agency) throw new ApiError(404, "NOT_FOUND", "Agency not found");
      if (actor.kind === "agency" && String(agency._id) !== actor.agency_id) throw new ApiError(404, "NOT_FOUND", "Agency not found");
      if (actor.kind === "platform" && actor.ctx.user.role === "SalesExecutive" && String(agency.sales_owner_id) !== actor.ctx.user.id) {
        throw new ApiError(404, "NOT_FOUND", "Agency not found");
      }
      type = await orderTypeFor(agency, Boolean(input.upgrade));
      if (type === "NEW") {
        // A rejected purchase re-submitted → back to PENDING.
        agency.status = "PENDING";
        await agency.save(sessionOpt(session));
      }
      // Seats/branches cannot be below current usage.
      const activeUsers = await User.countDocuments({ tenant_id: agency._id, is_active: { $ne: false } }).session(session);
      if (Number(input.seats) < activeUsers) {
        throw new ApiError(400, "LIMIT_BELOW_USAGE", `The agency has ${activeUsers} active users — choose at least ${activeUsers} seats or deactivate users first`);
      }
      if (actor.kind === "agency") {
        const pending = await Order.findOne({ agency_id: agency._id, status: "PENDING" }).session(session).lean();
        if (pending) throw new ApiError(409, "ORDER_PENDING", `Order ${pending.order_number} is already awaiting payment verification`);
      }
    } else {
      const na = input.new_agency;
      if (!na?.business_name?.trim() || !na.owner_name?.trim() || !na.owner_email?.trim()) {
        throw new ApiError(400, "VALIDATION_ERROR", "Business name, owner name and owner email are required");
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(na.owner_email.trim())) throw new ApiError(400, "VALIDATION_ERROR", "Invalid owner email");
      if (await User.exists({ email: na.owner_email.trim().toLowerCase() }).session(session)) {
        throw new ApiError(409, "EMAIL_IN_USE", "An account with this email already exists. Please sign in and renew from the app, or contact us.");
      }
      possibleDuplicate = Boolean(await findDuplicateAgency({ email: na.owner_email, phone: na.owner_phone, business_name: na.business_name }));
      type = "NEW";
      if (isStaff && actor.ctx.user.role === "SalesExecutive") salesOwner = new Types.ObjectId(actor.ctx.user.id);
      const [created] = await Tenant.create(
        [
          {
            name: na.business_name.trim(),
            status: "PENDING",
            access_expires_at: null,
            max_users: Number(input.seats) || 1,
            branch_limit: Number(input.branches) || 1,
            contact_person: na.owner_name,
            contact_email: na.owner_email.trim().toLowerCase(),
            contact_phone: na.owner_phone || "",
            owner_name: na.owner_name.trim(),
            owner_email: na.owner_email.trim().toLowerCase(),
            owner_phone: na.owner_phone || "",
            business_phone: na.business_phone || "",
            business_email: na.business_email || "",
            business_address: na.business_address || "",
            address: na.business_address || "",
            source: isStaff ? (actor.ctx.user.role === "SalesExecutive" ? "SALES_EXEC" : "ADMIN_CREATED") : "PUBLIC_PURCHASE",
            sales_owner_id: salesOwner,
            possible_duplicate: possibleDuplicate,
            marketing_consent: Boolean(na.marketing_consent),
          },
        ],
        sessionOpt(session)
      );
      agency = created;
      if (actor.kind === "public") {
        await recordConsent(
          { agency_id: created._id, email: na.owner_email, data_consent: Boolean(na.data_consent), marketing_consent: Boolean(na.marketing_consent), ip: actor.meta.ip, user_agent: actor.meta.user_agent },
          session
        );
      }
    }

    const q = await quote({
      type,
      agency,
      seats: input.seats,
      branches: input.branches,
      term_quarters: input.term_quarters,
      promo_code: input.promo_code,
      manual_adjustment: input.manual_adjustment,
    });
    if (q.promo_error) throw new ApiError(400, "PROMO_INVALID", q.promo_error);

    // Public signups: the promo code's Sales Executive becomes the sales owner.
    if (q.promo?.owner_earner_id && !agency!.sales_owner_id) {
      const earner = await CommissionEarner.findById(q.promo.owner_earner_id).session(session).lean();
      if (earner?.type === "SALES_EXECUTIVE" && earner.platform_user_id) {
        agency!.sales_owner_id = earner.platform_user_id;
        await agency!.save(sessionOpt(session));
      }
    }

    let amountReceived = q.total_due;
    let overrideReason: string | null = null;
    let collectedBy: Types.ObjectId | null = null;
    let collectedAt: Date | null = null;
    if (isStaff) {
      amountReceived = input.amount_received === null || input.amount_received === undefined ? q.total_due : roundHalfUp(Number(input.amount_received));
      if (amountReceived !== q.total_due) {
        if (role !== "SuperAdmin") throw new ApiError(400, "AMOUNT_MISMATCH", `Amount received must equal the total due (${q.total_due})`);
        overrideReason = (input.amount_override_reason || "").trim();
        if (!overrideReason) throw new ApiError(400, "REASON_REQUIRED", "A reason is required when the amount received differs from the total due");
      }
      const collectorId = input.collected_by || actor.ctx.user.id;
      const collector = await User.findById(collectorId).select("role").session(session).lean();
      if (!collector || !["SuperAdmin", "Manager", "SalesExecutive"].includes(collector.role)) {
        throw new ApiError(400, "VALIDATION_ERROR", "Collector must be a platform user");
      }
      collectedBy = collector._id as Types.ObjectId;
      collectedAt = input.collected_at ? new Date(input.collected_at) : new Date();
    }

    const number = await nextNumber("order", session);
    const [order] = await Order.create(
      [
        {
          order_number: formatNumber("ORD", number),
          payment_reference: await uniqueReference(session),
          agency_id: agency!._id,
          type,
          status: "PENDING",
          source: isStaff ? "ADMIN_PANEL" : actor.kind === "agency" ? "AGENCY_APP" : "PUBLIC_FORM",
          term_quarters: q.term_quarters,
          months: q.months,
          seats: q.seats,
          branches: q.branches,
          price_book_id: q.price_book_id,
          monthly_price: q.monthly_price,
          list_price: q.list_price,
          campaign_id: q.campaign?.id ?? null,
          campaign_discount: q.campaign_discount,
          promo_code_id: q.promo?.id ?? null,
          promo_code: q.promo?.code ?? null,
          promo_discount: q.promo_discount,
          manual_adjustment: q.manual_adjustment,
          adjustment_reason: q.manual_adjustment ? (input.adjustment_reason || "").trim() : null,
          tax_amount: q.tax_amount,
          total_due: q.total_due,
          remaining_days: q.remaining_days,
          payment_method: input.payment_method === "CASH" ? "CASH" : "BANK_TRANSFER",
          amount_received: amountReceived,
          amount_override_reason: overrideReason,
          collected_by_platform_user_id: collectedBy,
          collected_at: collectedAt,
          payment_note: (input.payment_note || "").slice(0, 1000),
          submitted_by_platform_user_id: isStaff ? actor.ctx.user.id : null,
          submitted_by_agency_user_id: actor.kind === "agency" ? actor.user_id : null,
          possible_duplicate: possibleDuplicate || Boolean(agency!.possible_duplicate),
          lines: q.lines,
          owner_email: agency!.owner_email || agency!.contact_email || "",
        },
      ],
      sessionOpt(session)
    );

    await writeAudit(auditActorFor(actor), { action: "order.create", entity_type: "order", entity_id: order._id, agency_id: agency!._id, after: order.toObject() }, session);

    if (!isStaff && order.owner_email) {
      const t = await templates.orderReceived({ order_number: order.order_number, payment_reference: order.payment_reference, total_due: order.total_due, agency_name: agency!.name });
      await enqueueEmail({ to: order.owner_email, ...t, category: "ORDER", related_type: "order", related_id: String(order._id), idempotency_key: `order-received:${order._id}` }, session);
    }
    return order.toObject() as IOrder;
  });

  // Self-collected by Manager / Super Admin → auto-approved (audited as self-approval).
  if (
    actor.kind === "platform" &&
    (role === "SuperAdmin" || role === "Manager") &&
    String(created.collected_by_platform_user_id) === actor.ctx.user.id
  ) {
    return approveOrder(actor.ctx, String(created._id), { auto: true });
  }
  return { order: created, receipt: null };
}

function periodLabel(start: Date, end: Date) {
  return `${formatPKT(start)} to ${formatPKT(end)}`;
}

/**
 * Approve — one transaction (§7.3): claim the PENDING order, apply lifecycle,
 * create the period, issue the gapless receipt, accrue commission, audit, and
 * queue emails. Idempotent: a non-PENDING order returns the existing result.
 */
export async function approveOrder(ctx: PlatformContext | null, orderId: string, opts: { auto?: boolean } = {}) {
  const result = await withTxn(async (session) => {
    const now = new Date();
    const claimed = await Order.findOneAndUpdate(
      { _id: orderId, status: "PENDING" },
      { $set: { status: "APPROVED", approved_by: ctx ? ctx.user.id : null, approved_at: now } },
      { returnDocument: "after", ...sessionOpt(session) }
    );
    if (!claimed) {
      const existing = await Order.findById(orderId).session(session).lean();
      if (!existing) throw new ApiError(404, "NOT_FOUND", "Order not found");
      if (existing.status !== "APPROVED") throw new ApiError(409, "INVALID_STATE", `Order is ${existing.status}`);
      const receipt = await Receipt.findOne({ order_id: existing._id }).session(session).lean();
      return { order: existing, receipt, idempotent: true };
    }
    const order = claimed;

    const agency = await Tenant.findById(order.agency_id).session(session);
    if (!agency) throw new ApiError(404, "NOT_FOUND", "Agency not found");
    const before = { status: agency.status, access_expires_at: agency.access_expires_at, max_users: agency.max_users, branch_limit: agency.branch_limit };
    const current = getEffectiveStatus(agency, now);
    if (["SUSPENDED", "COLD_STORAGE", "PURGED"].includes(current)) {
      throw new ApiError(409, "INVALID_STATE", `Cannot approve an order while the agency is ${current} — activate or restore it first`);
    }

    // Lifecycle + subscription period math (§7.3.1).
    let setPasswordLink: string | null = null;
    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;
    order.previous_seats = agency.max_users;
    order.previous_branches = agency.branch_limit ?? 1;

    if (order.type === "UPGRADE") {
      if (current !== "ACTIVE") throw new ApiError(409, "INVALID_STATE", "Upgrades require an active subscription");
      agency.max_users = order.seats;
      agency.branch_limit = order.branches;
    } else {
      const renewing = current === "ACTIVE" && agency.access_expires_at && new Date(agency.access_expires_at) > now;
      periodStart = renewing ? new Date(agency.access_expires_at!) : now;
      periodEnd = addMonths(periodStart, order.months);
      const applyNow = periodStart <= now;
      await SubscriptionPeriod.create(
        [{ agency_id: agency._id, order_id: order._id, source: "ORDER", starts_at: periodStart, ends_at: periodEnd, seats: order.seats, branches: order.branches, limits_applied: applyNow, created_by: ctx?.user.id ?? null }],
        sessionOpt(session)
      );
      if (applyNow) {
        agency.max_users = order.seats;
        agency.branch_limit = order.branches;
      }
      agency.access_expires_at = periodEnd;
      if (order.type === "NEW" || ["PENDING", "REJECTED"].includes(normalizeStatus(agency.status))) {
        agency.status = "ACTIVE";
        const prov = await provisionOwner(agency, session, "welcome");
        setPasswordLink = prov.link;
      }
      if (order.type === "REACTIVATION" || normalizeStatus(agency.status) === "OFFBOARDED") {
        agency.offboarded_at = null;
        agency.offboard_reason = null;
        agency.retention_until = null;
        agency.retention_months = null;
      }
      agency.status = "ACTIVE";
    }

    // Commission attribution (§7.5).
    let earnerId: Types.ObjectId | null = null;
    if (order.promo_code_id) {
      const promo = await PromoCode.findById(order.promo_code_id).session(session).lean();
      earnerId = (promo?.owner_earner_id as Types.ObjectId) ?? null;
      if (earnerId && !agency.referrer_earner_id) agency.referrer_earner_id = earnerId;
    }
    if (!earnerId && agency.referrer_earner_id) {
      const ref = await CommissionEarner.findById(agency.referrer_earner_id).session(session).lean();
      if (ref?.commission_scope === "ALL_PAYMENTS") earnerId = ref._id as Types.ObjectId;
    }
    let commission = null;
    if (earnerId) {
      const earner = await CommissionEarner.findById(earnerId).session(session).lean();
      if (earner?.is_active && earner.commission_percent > 0) {
        const basis = order.total_due - order.tax_amount;
        const amount = roundHalfUp((basis * earner.commission_percent) / 100);
        if (amount > 0) {
          [commission] = await CommissionEntry.create(
            [{ earner_id: earner._id, order_id: order._id, kind: "ACCRUAL", basis_amount: basis, rate_percent: earner.commission_percent, amount, status: "ACCRUED" }],
            sessionOpt(session)
          );
          order.commission_earner_id = earner._id as Types.ObjectId;
        }
      }
    }

    await agency.save(sessionOpt(session));

    // Gapless receipt.
    const rn = await nextNumber("receipt", session);
    const details = {
      order_number: order.order_number,
      order_type: order.type,
      payment_reference: order.payment_reference,
      payment_method: order.payment_method === "CASH" ? "Cash" : "Bank transfer",
      seats: order.seats,
      branches: order.branches,
      term: order.months ? `${order.term_quarters} quarter${order.term_quarters > 1 ? "s" : ""} (${order.months} months)` : "Prorated upgrade",
      period: periodStart && periodEnd ? periodLabel(periodStart, periodEnd) : null,
      agency_name: agency.name,
      previous_seats: order.previous_seats,
      previous_branches: order.previous_branches,
    };
    const [receipt] = await Receipt.create(
      [{ receipt_number: formatNumber("RCT", rn), order_id: order._id, agency_id: agency._id, issued_at: now, issued_by: ctx?.user.id ?? null, lines: order.lines, details, total: order.total_due }],
      sessionOpt(session)
    );

    order.receipt_email_status = order.owner_email ? "PENDING" : null;
    await order.save(sessionOpt(session));

    await writeAudit(
      ctx ? platformActor(ctx) : systemActor,
      {
        action: opts.auto ? "order.approve.self" : "order.approve",
        entity_type: "order",
        entity_id: order._id,
        agency_id: agency._id,
        before: { order_status: "PENDING", agency: before },
        after: { order_status: "APPROVED", receipt_number: receipt.receipt_number, commission: commission?.amount ?? 0, agency: { status: agency.status, access_expires_at: agency.access_expires_at, max_users: agency.max_users, branch_limit: agency.branch_limit } },
        reason: opts.auto ? "Collected by approver (auto-approved)" : null,
      },
      session
    );

    if (order.owner_email) {
      const t = await templates.receipt({ receipt_number: receipt.receipt_number, issued_at: now, agency_name: agency.name, lines: receipt.lines, total: receipt.total, details });
      await enqueueEmail({ to: order.owner_email, ...t, category: "RECEIPT", related_type: "order_receipt", related_id: String(order._id), idempotency_key: `receipt:${receipt._id}` }, session);
    }
    return { order: order.toObject(), receipt: receipt.toObject(), set_password_link: setPasswordLink, idempotent: false };
  });
  if (result.order) invalidateAgency(String(result.order.agency_id));
  return result;
}

export async function rejectOrder(ctx: PlatformContext, orderId: string, reason: string) {
  return withTxn(async (session) => {
    const order = await Order.findOneAndUpdate(
      { _id: orderId, status: "PENDING" },
      { $set: { status: "REJECTED", rejected_by: ctx.user.id, rejected_at: new Date(), reject_reason: reason } },
      { returnDocument: "after", ...sessionOpt(session) }
    );
    if (!order) throw new ApiError(409, "INVALID_STATE", "Only pending orders can be rejected");
    const agency = await Tenant.findById(order.agency_id).session(session);
    if (agency && order.type === "NEW" && normalizeStatus(agency.status) === "PENDING") {
      agency.status = "REJECTED";
      await agency.save(sessionOpt(session));
    }
    await writeAudit(platformActor(ctx), { action: "order.reject", entity_type: "order", entity_id: order._id, agency_id: order.agency_id, before: { status: "PENDING" }, after: { status: "REJECTED" }, reason }, session);
    if (order.owner_email) {
      const t = await templates.orderRejected({ order_number: order.order_number, reason });
      await enqueueEmail({ to: order.owner_email, ...t, category: "ORDER", related_type: "order", related_id: String(order._id), idempotency_key: `order-rejected:${order._id}` }, session);
    }
    return order.toObject();
  });
}

/** Agency user / staff cancels a pending order (releases promo redemption). */
export async function cancelOrder(orderId: string, agencyId: string | null, actor: Parameters<typeof writeAudit>[0]) {
  return withTxn(async (session) => {
    const filter: Record<string, unknown> = { _id: orderId, status: "PENDING" };
    if (agencyId) filter.agency_id = agencyId;
    const order = await Order.findOneAndUpdate(filter, { $set: { status: "CANCELLED", cancelled_at: new Date() } }, { returnDocument: "after", ...sessionOpt(session) });
    if (!order) throw new ApiError(409, "INVALID_STATE", "Only pending orders can be cancelled");
    await writeAudit(actor, { action: "order.cancel", entity_type: "order", entity_id: order._id, agency_id: order.agency_id, before: { status: "PENDING" }, after: { status: "CANCELLED" } }, session);
    return order.toObject();
  });
}

/** Reverse (Super Admin): void receipt, void period, recompute expiry, negative commission. Never deletes. */
export async function reverseOrder(ctx: PlatformContext, orderId: string, reason: string) {
  const result = await withTxn(async (session) => {
    const now = new Date();
    const order = await Order.findOneAndUpdate(
      { _id: orderId, status: "APPROVED" },
      { $set: { status: "REVERSED", reversed_by: ctx.user.id, reversed_at: now, reverse_reason: reason } },
      { returnDocument: "after", ...sessionOpt(session) }
    );
    if (!order) throw new ApiError(409, "INVALID_STATE", "Only approved orders can be reversed");

    await Receipt.updateOne({ order_id: order._id, voided_at: null }, { $set: { voided_at: now, void_reason: reason } }, sessionOpt(session));
    await SubscriptionPeriod.updateMany({ order_id: order._id, voided_at: null }, { $set: { voided_at: now } }, sessionOpt(session));

    const agency = await Tenant.findById(order.agency_id).session(session);
    if (agency) {
      const before = { status: agency.status, access_expires_at: agency.access_expires_at, max_users: agency.max_users, branch_limit: agency.branch_limit };
      if (order.type === "UPGRADE") {
        if (order.previous_seats) agency.max_users = order.previous_seats;
        if (order.previous_branches) agency.branch_limit = order.previous_branches;
      } else {
        const latest = await SubscriptionPeriod.findOne({ agency_id: agency._id, voided_at: null }).sort({ ends_at: -1 }).session(session).lean();
        const fallback = agency.trial_ends_at ?? now;
        agency.access_expires_at = latest ? latest.ends_at : fallback;
        if (latest) {
          agency.max_users = latest.seats;
          agency.branch_limit = latest.branches;
        }
      }
      const s = normalizeStatus(agency.status);
      if ((s === "ACTIVE" || s === "TRIAL") && agency.access_expires_at && new Date(agency.access_expires_at) <= now) agency.status = "EXPIRED";
      await agency.save(sessionOpt(session));
      await writeAudit(platformActor(ctx), { action: "agency.order_reversed", entity_type: "agency", entity_id: agency._id, agency_id: agency._id, before, after: { status: agency.status, access_expires_at: agency.access_expires_at, max_users: agency.max_users, branch_limit: agency.branch_limit }, reason }, session);
    }

    const accruals = await CommissionEntry.find({ order_id: order._id, kind: "ACCRUAL" }).session(session).lean();
    for (const a of accruals) {
      await CommissionEntry.create(
        [{ earner_id: a.earner_id, order_id: order._id, kind: "REVERSAL", basis_amount: -a.basis_amount, rate_percent: a.rate_percent, amount: -a.amount, status: "ACCRUED" }],
        sessionOpt(session)
      );
    }
    await writeAudit(platformActor(ctx), { action: "order.reverse", entity_type: "order", entity_id: order._id, agency_id: order.agency_id, before: { status: "APPROVED" }, after: { status: "REVERSED", commission_reversed: accruals.reduce((s, a) => s + a.amount, 0) }, reason }, session);
    return order.toObject();
  });
  invalidateAgency(String(result.agency_id));
  return result;
}

export async function resendReceipt(ctx: PlatformContext, orderId: string) {
  return withTxn(async (session) => {
    const order = await Order.findById(orderId).session(session);
    if (!order || order.status !== "APPROVED") throw new ApiError(409, "INVALID_STATE", "Only approved orders have receipts");
    const receipt = await Receipt.findOne({ order_id: order._id }).session(session).lean();
    if (!receipt) throw new ApiError(404, "NOT_FOUND", "Receipt not found");
    if (!order.owner_email) throw new ApiError(400, "VALIDATION_ERROR", "No customer email on this order");
    const t = await templates.receipt({ receipt_number: receipt.receipt_number, issued_at: receipt.issued_at, agency_name: String(receipt.details?.agency_name ?? ""), lines: receipt.lines, total: receipt.total, details: receipt.details });
    await enqueueEmail({ to: order.owner_email, ...t, category: "RECEIPT", related_type: "order_receipt", related_id: String(order._id), idempotency_key: `receipt-resend:${receipt._id}:${Date.now()}` }, session);
    order.receipt_email_status = "PENDING";
    await order.save(sessionOpt(session));
    await writeAudit(platformActor(ctx), { action: "order.resend_receipt", entity_type: "order", entity_id: order._id, agency_id: order.agency_id }, session);
    return order.toObject();
  });
}
