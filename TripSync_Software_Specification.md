# TripSync — Software Specification Document
### Version 1.0 — August 19, 2026

---

## 1. Document Purpose & Audience

This document specifies TripSync's Finance Management module in enough detail for a developer or an AI coding agent to implement it without guessing intent — data model, business rules, and API contract included. It also captures the full platform roadmap (Bookings, CRM, Vendor Management, etc.) at the feature-list level, explicitly flagged as **not yet build-ready**, so nothing from the ecosystem vision gets lost or silently dropped.

**How to read this document:** Section 3 (Finance) is authoritative and implementable today. Section 4 (everything else) is a scope reference, not an implementation spec — those modules haven't been through the same question-by-question foundation-locking exercise Finance has, and building against them today would mean inventing decisions the founder hasn't made.

---

## 2. System Overview & Architecture Principles

- **Multi-tenant SaaS from day one.** Every core table carries a `tenant_id`. No tenant can query, join, or leak data across another tenant's boundary under any circumstance — this is enforced at the data-access layer, not just application logic.
- **Single, unified build — no phase gating.** TripSync is being developed as one system, not staged releases. That said, internal build *order* still applies within this spec: Finance is the foundation every other module (Bookings, CRM, Vendor) will attach to via nullable reference fields, so Finance's schema must be stable before those modules are wired in.
- **Stack:** React/Next.js frontend; Node.js backend (NestJS or Express — final framework choice left to the dev team unless specified otherwise); PostgreSQL as the primary datastore, chosen for its relational integrity guarantees, which matter given the financial and audit-sensitive nature of this data.
- **No hard deletes, anywhere, on financial data.** This is a system-wide architectural rule, not a per-feature toggle: every financial record is append-only at the ledger level. Corrections happen through Void, Refund, or CreditNote — never through row deletion. This is enforced at the database layer (no `DELETE` grants on financial tables for the application role) as well as the application layer.
- **Full field-level audit trail on every financial entity.** Every insert and update to a financial record is captured: who, when, which field, old value, new value. This is not optional per-table — it is a cross-cutting concern implemented once (e.g., via a shared audit-logging mechanism / trigger pattern) and applied uniformly.
- **Forward-compatible schema for deferred modules.** Where a Phase-2-style concept (a Booking, a Vendor) doesn't exist yet, Finance entities carry a nullable `booking_reference` (and similar anchor fields) so those modules can attach later without a breaking migration. No placeholder tables are created for modules that aren't specified yet.

---

## 3. Finance Management Module (Build-Ready)

### 3.1 Scope Summary — All 13 Foundational Decisions Applied

| Area | Locked Decision |
|---|---|
| Commission | Variable. Set as a default rate on the Agent's profile; overridable per invoice line item. **Invoice-level override always wins when present.** |
| FX rate | Auto-fetched from an external rate API. **API/provider to be supplied by the founder directly to the dev team** — the schema is built provider-agnostic (see 3.3, ExchangeRate). |
| Payment gateway | Deferred. `Payment` entity is gateway-agnostic; no gateway integration ships in this version. |
| Partial/overpayment | Customer-level running ledger (B2B statement model). Payments are **manually allocated by staff** against specific invoices — no automatic FIFO. |
| Invoice numbering | Strictly sequential, gapless, per tenant. No number is ever reused or skipped, including for voided invoices. |
| BSP reporting | Reference-only (light). Invoices/tickets carry a BSP flag and billing period. No auto-reconciliation against IATA billing — that remains a manual, outside-TripSync accountant task. |
| Credit limit | Recorded per customer for reference only. **No manager approval** — a sale that takes a customer over their limit is not blocked. |
| Expense approval | Per-expense-**type** toggle, set at creation time (`requires_approval: true/false`). Not a blanket rule. |
| Audit log | Field-level. Every change captured as: who, what field, old value, new value, when. |
| Hard delete | Never, on any posted financial record. Void/Refund/CreditNote only. |
| Tax codes | Both IATA/BSP codes and FBR (Pakistani tax authority) codes supported. Tenant chooses which to populate and use — the system doesn't force either. |
| Base currency & historical conversion | One base currency per tenant, user-changeable at any time. **All reports — including historical ones — always display converted at the *current* exchange rate, not the rate in effect at the time of the original transaction.** (Example: a 2016 report originally recorded in PKR, viewed today in USD, converts at today's PKR→USD rate, not 2016's rate.) The original transaction amount and its original-currency value are preserved permanently for audit purposes; only the *display* conversion is always-current. |
| Umrah data model | Deferred. Not represented as a distinct entity in this version — `InvoiceLineItem.service_type` includes `Umrah` as an enum value only, with no dedicated schema yet. |

### 3.2 Feature List

| Feature | Description |
|---|---|
| Invoicing & Receipts | Sequential, gapless invoice generation with line-item detail; receipt generation on payment |
| Voucher Lifecycle | Entry → Void/Refund only, no delete, on every financial transaction type |
| Customer Ledger | Running per-customer balance across all invoices and payments, supporting statement-style (monthly/quarterly) billing |
| Manual Payment Allocation | Staff assign an incoming payment across one or more specific outstanding invoices |
| Agent Commission Management | Default commission rate per agent; per-invoice override; commission computed and tracked per sale |
| Credit Limit | Per-customer credit limit shown on the customer profile and ledger; not enforced and no approval required |
| Expense Tracking | Categorized expense entry with per-type approval requirement |
| Approval Workflow | Manager approval for expenses whose type requires it |
| Multi-Currency Support | Transactions recorded in original currency; auto-fetched FX rate at time of entry; base-currency reporting with always-current conversion |
| Tax Code Management | Supports both IATA/BSP and FBR tax codes, tenant-configurable |
| BSP Reference Tagging | Light-touch BSP flag + billing period field on relevant transactions, no reconciliation logic |
| Field-Level Audit Log | Full forensic change history on every financial record |
| Financial Reporting | P&L, dues/aging, revenue, agent performance, all rendered in tenant's current base currency |

### 3.3 Data Model

**Tenant Isolation & Audit Rationale:** Every table below includes `tenant_id` (foreign key, indexed, enforced at query layer) and standard audit columns (`created_at`, `created_by`, `updated_at`, `updated_by`). These are omitted from the field lists below to avoid repetition, but are mandatory on every entity.

---

**Tenant**
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| name | string | Agency name |
| base_currency | string (ISO 4217) | Changeable at any time; drives all report display conversion |
| invoice_prefix | string | Used in sequential invoice numbering |

---

**User**
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| tenant_id | UUID (FK) | |
| name | string | |
| email | string | |
| role | enum | Owner / Accountant / Agent / Viewer |
| default_commission_rate | decimal, nullable | Only meaningful if role = Agent; percentage or flat, see CommissionProfile note below |

*Note: commission rate structure (percentage vs. flat amount, and whether it varies by service type) is left as a configurable field type rather than hard-coded — see Commission entity below for how it's actually applied per sale.*

---

**Customer**
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| tenant_id | UUID (FK) | |
| name | string | |
| contact_info | JSON | |
| credit_limit | decimal, nullable | Null = no limit enforced |
| current_balance | decimal | Running ledger balance, derived from Invoice + Payment + CreditNote activity |

---

**Invoice**
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| tenant_id | UUID (FK) | |
| customer_id | UUID (FK) | |
| invoice_number | string | Sequential, gapless, tenant-scoped |
| status | enum | Draft / Posted / Voided |
| currency | string (ISO 4217) | Original transaction currency |
| fx_rate_at_posting | decimal | Rate in effect when this invoice was posted — preserved permanently, used to compute base-currency-equivalent for that period's original bookkeeping |
| total_amount | decimal | In original currency |
| booking_reference | string, nullable | **Phase-2 anchor** — links to a future Booking entity; not populated by anything in this version |
| bsp_flag | boolean | Reference-only tag |
| bsp_billing_period | string, nullable | e.g. "2026-08 1st half" — reference only, no validation logic |

---

**InvoiceLineItem**
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| invoice_id | UUID (FK) | |
| service_type | enum | Ticket / Hotel / Package / Umrah / Visa / Other — Umrah included as an enum value only, no dedicated schema yet |
| description | string | |
| amount | decimal | |
| tax_code_id | UUID (FK), nullable | |
| commission_id | UUID (FK), nullable | Links to the Commission record generated for this line item, if any |
| booking_reference | string, nullable | **Phase-2 anchor** |

---

**CreditNote**
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| tenant_id | UUID (FK) | |
| invoice_id | UUID (FK) | The invoice being refunded/corrected |
| amount | decimal | |
| reason | string | |
| status | enum | Posted / Voided (never deleted) |

*Used for the "wrongly created invoice" correction case explicitly — this is the mechanism, not deletion.*

---

**Payment**
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| tenant_id | UUID (FK) | |
| customer_id | UUID (FK) | |
| amount | decimal | |
| currency | string | |
| payment_method | string | Manual entry in this version — no gateway integration |
| status | enum | Posted / Voided |

---

**PaymentAllocation**
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| payment_id | UUID (FK) | |
| invoice_id | UUID (FK) | |
| allocated_amount | decimal | |

*Junction table — a single payment can be split across multiple invoices, and this split is always staff-entered, never auto-computed.*

---

**Commission**
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| tenant_id | UUID (FK) | |
| agent_id | UUID (FK → User) | |
| invoice_line_item_id | UUID (FK) | |
| rate_source | enum | AgentDefault / InvoiceOverride |
| rate_applied | decimal | The actual rate used — always the override value if one was set, per the locked rule |
| amount | decimal | Computed commission amount |
| status | enum | Posted / Clawed Back / Voided |

---

**ExpenseType**
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| tenant_id | UUID (FK) | |
| name | string | e.g. "Office Refreshments," "Software Subscriptions" |
| requires_approval | boolean | Set once at creation; every Expense of this type inherits it |

---

**Expense**
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| tenant_id | UUID (FK) | |
| expense_type_id | UUID (FK) | |
| amount | decimal | |
| status | enum | Draft / PendingApproval / Approved / Posted / Voided |
| approval_request_id | UUID (FK), nullable | Populated only if the expense type requires approval |

---

**ApprovalRequest**
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| tenant_id | UUID (FK) | |
| type | enum | ExpenseApproval |
| related_entity_id | UUID | Points to the Expense |
| requested_by | UUID (FK → User) | |
| status | enum | Pending / Approved / Rejected |
| resolved_by | UUID (FK → User), nullable | Must be role = Owner or Accountant with manager privilege |

*Shared mechanism for both approval flows in this version, rather than two separate one-off tables — keeps the pattern consistent if more approval types are added later.*

---

**TaxCode**
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| tenant_id | UUID (FK) | |
| code | string | |
| category | enum | IATA_BSP / FBR |
| rate | decimal | |
| active | boolean | |

---

**Currency**
| Field | Type | Notes |
|---|---|---|
| code | string (ISO 4217, PK) | |
| name | string | |

**ExchangeRate**
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| from_currency | string (FK → Currency) | |
| to_currency | string (FK → Currency) | |
| rate | decimal | |
| fetched_at | timestamp | |
| source | string | Provider identifier — provider itself TBD, to be supplied by founder |

*Historical rows are retained permanently (never overwritten) to preserve `fx_rate_at_posting` accuracy on old invoices. Report-display logic, however, always queries the **most recent** row for a given currency pair regardless of the report's period — this is the mechanism behind the "always current rate" reporting rule.*

---

**AuditLog**
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| tenant_id | UUID (FK) | |
| entity_type | string | e.g. "Invoice" |
| entity_id | UUID | |
| field_changed | string | |
| old_value | text | |
| new_value | text | |
| changed_by | UUID (FK → User) | |
| changed_at | timestamp | |

*Example row this produces, matching the founder's own description:* `entity_type: Invoice, entity_id: <1023>, field_changed: total_amount, old_value: 45000, new_value: 52000, changed_by: Ahmed, changed_at: 2026-08-19 14:14`

---

### 3.4 Business Rules & Workflows

**Commission calculation:** On posting an InvoiceLineItem, the system checks for an invoice-level commission override on that line item. If present, `rate_source = InvoiceOverride` and that rate is used. If absent, the system pulls `User.default_commission_rate` for the assigned agent (`rate_source = AgentDefault`). The resulting `Commission` record is always created — there is no "no commission" state for an agent-attributed sale unless the rate is explicitly zero.

**Credit limit (no approval):** `Customer.credit_limit` is informational only. Posting an Invoice never checks it, never creates an `ApprovalRequest`, and is never blocked by it.

**Expense approval:** On Expense creation, the system checks `ExpenseType.requires_approval`. If true, the Expense enters `PendingApproval` status and an `ApprovalRequest (type: ExpenseApproval)` is created; it cannot post until approved. If false, it posts directly.

**Payment allocation:** A Payment is recorded against a Customer, not directly against an Invoice. Staff then manually create one or more `PaymentAllocation` rows splitting that payment across specific open invoices. `Customer.current_balance` is derived from the sum of posted Invoices minus the sum of allocated Payments and CreditNotes — this supports the B2B statement billing model directly (a customer can be paid down over months without needing 1:1 invoice-payment matching).

**Void-only correction:** No Invoice, Payment, Expense, or Commission record can ever be deleted, regardless of role. Corrections happen via: (a) Void — reverses the record's effect and freezes it, retaining its number/id permanently; (b) CreditNote — for invoices specifically, issues a formal financial reversal without touching the original record. Both actions are themselves logged in AuditLog like any other change.

**Currency conversion for reporting:** Every financial record retains its original currency and the FX rate in effect when it was posted (`fx_rate_at_posting`) — this is never altered. Report-generation logic, however, always converts amounts into the tenant's *current* `base_currency` using the *latest* available `ExchangeRate` row for that currency pair, irrespective of the report's date range. This means the same historical report can show different converted totals on two different days if the rate has moved, by design.

**BSP tagging (reference-only):** `Invoice.bsp_flag` and `bsp_billing_period` are plain fields, settable by staff. No validation, matching, or reconciliation logic runs against them in this version — they exist purely so BSP-relevant transactions can be filtered into a report for the accountant's manual, outside-system reconciliation process.

### 3.5 API Specification

| Endpoint | Method | Purpose | Request / Response Shape | Auth / Tenant-Scoping |
|---|---|---|---|---|
| `/invoices` | POST | Create a draft invoice | Req: customer_id, line_items[]; Resp: Invoice object | Requires authenticated User; tenant_id injected from session, never client-supplied |
| `/invoices/{id}/post` | POST | Post a draft invoice | Resp: Invoice object | Same tenant as invoice owner |
| `/invoices/{id}/void` | POST | Void a posted invoice | Req: reason; Resp: updated Invoice | Requires Accountant or Owner role |
| `/invoices/{id}/credit-notes` | POST | Issue a credit note against an invoice | Req: amount, reason; Resp: CreditNote object | Requires Accountant or Owner role |
| `/customers/{id}/ledger` | GET | Retrieve running ledger (invoices, payments, balance) | Resp: paginated ledger entries + current_balance | Tenant-scoped; Viewer role gets read-only |
| `/payments` | POST | Record a customer payment | Req: customer_id, amount, currency, method; Resp: Payment object | Requires Accountant or Owner role |
| `/payments/{id}/allocate` | POST | Manually allocate a payment across invoices | Req: [{invoice_id, amount}]; Resp: PaymentAllocation[] | Requires Accountant or Owner role |
| `/expenses` | POST | Create an expense (auto-routes to approval if required) | Req: expense_type_id, amount; Resp: Expense object (status reflects approval routing) | Any authenticated User can submit; approval resolution requires manager role |
| `/expense-types` | POST | Define a new expense type | Req: name, requires_approval; Resp: ExpenseType object | Requires Owner or Accountant role |
| `/approval-requests/{id}/resolve` | POST | Approve or reject a pending approval | Req: decision (approve/reject); Resp: updated ApprovalRequest | Requires Owner or Accountant (manager) role |
| `/commissions` | GET | List commissions, filterable by agent/date | Resp: Commission[] | Tenant-scoped; Agent role sees only their own records |
| `/tax-codes` | GET / POST | List or create tax codes (IATA_BSP or FBR category) | Resp: TaxCode[] | Requires Owner or Accountant to create |
| `/exchange-rates/latest` | GET | Fetch the most recent rate for a currency pair | Resp: ExchangeRate object | Internal use — powers report conversion |
| `/reports/pnl` | GET | Profit & Loss report | Req: date_range; Resp: report converted to tenant's current base_currency using latest rates | Tenant-scoped; Viewer role read-only |
| `/reports/dues-aging` | GET | Customer dues/aging report | Req: as_of_date; Resp: aging buckets per customer | Tenant-scoped |
| `/audit-log` | GET | Retrieve field-level audit history for an entity | Req: entity_type, entity_id; Resp: AuditLog[] | Requires Owner or Accountant role |

---

## 4. Platform Roadmap (Feature-List Reference — Not Yet Build-Ready)

The following are the remaining ecosystem domains from `TripSync_Full_Ecosystem_Vision.md`, listed here for completeness. **None of these have data models or API specs yet** — they require their own foundation-locking question sessions, the same way Finance just went through, before implementation work should start on them.

- **Bookings & Reservations Engine** — Ticket/Hotel/Package/Umrah/Visa/Group booking management, GDS integration, itinerary builder, booking status tracking, cancellation workflow
- **Vendor & Supplier Management** — vendor directory, foreign-currency vendor ledger, payables reconciliation, supplier contracts, supplier performance tracking
- **CRM & Sales Pipeline** — lead management, customer profiles, consultant assignment, communication log, follow-up reminders, segmentation
- **Documents & Records** — document repository, per-service checklists, expiry alerts
- **Client-Facing Portal / Website** — self-service portal, online payment collection (depends on Payment Gateway decision, deferred), branded itinerary sharing, agency marketing pages, package/Umrah listings
- **Communications & Notifications** — SMS/WhatsApp/email notifications, internal staff alerts, templated messaging
- **Compliance & Regulatory (beyond Finance)** — regulatory document retention, platform-wide role-based access control
- **Reporting & Analytics (ecosystem-wide)** — operational reports, sales performance, customer analytics, custom report builder
- **Platform / Admin** — multi-branch support, tenant settings/configuration, data import/migration tooling, API access for third parties

---

## 5. Non-Functional Requirements

- **Tenant isolation:** No cross-tenant data access under any query path — enforced at the database and application layer, tested explicitly, not assumed from application logic alone.
- **Audit retention:** AuditLog and Void/CreditNote history are retained indefinitely — no retention-based purging, given the no-delete architectural rule.
- **Performance baseline:** Ledger and report queries (P&L, dues aging) should remain performant as transaction volume grows into the tens of thousands of invoices per tenant — index `customer_id`, `tenant_id`, and `status` fields accordingly at build time.
- **Currency conversion consistency:** Report conversion logic must be centralized in one place (not duplicated per report type) so the "always current rate" rule can't drift out of sync between different reports.
- **Role enforcement:** Every approval-gated action (credit override, expense approval, void, credit note) must verify role server-side — never trust a client-side role check alone.

---

## 6. Deferred / Open Items Log

| Item | Status |
|---|---|
| FX rate API/provider | To be supplied directly by the founder to the dev team; schema is provider-agnostic in the meantime |
| Payment gateway selection (JazzCash/Easypaisa/card) | Deferred, not a v1 blocker |
| Umrah dedicated data model | Deferred — enum value exists on InvoiceLineItem, no separate schema yet |
| GDS integration (Amadeus/Galileo/Sabre/Worldspan) | Belongs to the future Bookings module — not started |
| Bookings, CRM, Vendor, Portal, Communications, Reporting (ecosystem-wide), Platform/Admin | Feature-listed only (Section 4) — each needs its own foundation-locking session before a data model or API spec can be written |

---

*This document reflects Finance Management as fully specified and ready for implementation. All other modules remain at the roadmap stage until walked through the same locking process applied here.*
