import { Invoice, Customer, ExchangeRate, Tenant, InvoiceLineItem, Commission, User } from "@/models";
import { logChanges } from "@/lib/audit";
import { validateInvoiceForPosting } from "@/lib/invoiceValidation";
import type { SessionUser } from "@/lib/api-helpers";

export type PostInvoiceResult =
  | { ok: true; invoice: InstanceType<typeof Invoice> }
  | { ok: false; status: number; error: string };

/**
 * Post one draft invoice: required-field validation, FX rate, customer balance, agent
 * commissions and audit log. Shared by single posting and batch posting so both apply
 * exactly the same rules.
 */
export async function postInvoice(user: SessionUser, id: string): Promise<PostInvoiceResult> {
  const invoice = await Invoice.findOne({ _id: id, tenant_id: user.tenant_id });
  if (!invoice) return { ok: false, status: 404, error: "Invoice not found" };
  if (invoice.status !== "Draft") return { ok: false, status: 400, error: "Only Draft invoices can be posted" };

  const lineItemsForValidation = await InvoiceLineItem.find({ invoice_id: invoice._id }).lean();
  const validationErrors = validateInvoiceForPosting({
    inv_date: invoice.created_at ? new Date(invoice.created_at).toISOString().split("T")[0] : "valid",
    customer_id: invoice.customer_id ? String(invoice.customer_id) : "",
    print_name: invoice.print_name || "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit_type: (invoice as any).visit_type || "Visitor",
    payment_mode: invoice.payment_mode || "CR",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    line_items: lineItemsForValidation as any,
  });
  if (validationErrors.length > 0) {
    return { ok: false, status: 400, error: `Cannot post invoice: ${validationErrors.join(", ")}` };
  }

  const customer = await Customer.findOne({ _id: invoice.customer_id, tenant_id: user.tenant_id });
  if (!customer) return { ok: false, status: 404, error: "Customer not found" };

  // No credit-limit approval: invoices post even when they take the customer over their limit.

  // Get FX rate
  const tenant = await Tenant.findById(user.tenant_id);
  let fxRate = 1;
  if (invoice.currency !== tenant!.base_currency) {
    const rate = await ExchangeRate.findOne({
      from_currency: invoice.currency,
      to_currency: tenant!.base_currency,
    }).sort({ fetched_at: -1 });
    if (rate) fxRate = rate.rate;
  }

  const oldDoc = invoice.toObject();
  invoice.status = "Posted";
  invoice.fx_rate_at_posting = fxRate;
  invoice.updated_by = user.user_id;
  await invoice.save();

  // Update customer balance
  customer.current_balance += invoice.total_amount;
  await customer.save();

  const creator = await User.findById(invoice.created_by || user.user_id);
  const lineItems = await InvoiceLineItem.find({ invoice_id: invoice._id });
  for (const item of lineItems) {
    if (creator && creator.role === "Agent") {
      const hasOverride = item.commission_override_rate !== null && item.commission_override_rate !== undefined;
      const rateApplied = hasOverride ? item.commission_override_rate! : creator.default_commission_rate;
      if (rateApplied !== undefined && rateApplied !== null) {
        const commission = await Commission.create({
          tenant_id: user.tenant_id,
          agent_id: creator._id,
          invoice_line_item_id: item._id,
          rate_source: hasOverride ? "InvoiceOverride" : "AgentDefault",
          rate_applied: rateApplied,
          amount: (item.amount * rateApplied) / 100,
          status: "Posted",
          created_by: user.user_id,
        });
        item.commission_id = commission._id;
        await item.save();
      }
    }
  }

  await logChanges(
    { tenant_id: user.tenant_id, entity_type: "Invoice", entity_id: invoice._id, changed_by: user.user_id },
    oldDoc,
    invoice.toObject()
  );

  return { ok: true, invoice };
}
