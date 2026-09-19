import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { Invoice, Customer, ApprovalRequest, ExchangeRate, Tenant, InvoiceLineItem, Commission, User } from "@/models";
import { logChanges } from "@/lib/audit";
import { validateInvoiceForPosting } from "@/lib/invoiceValidation";

// POST /api/invoices/[id]/post - Post a draft invoice (triggers credit-limit check)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await params;
    const invoice = await Invoice.findOne({ _id: id, tenant_id: user.tenant_id });
    if (!invoice) return errorResponse("Invoice not found", 404);
    if (invoice.status !== "Draft") return errorResponse("Only Draft invoices can be posted");

    const lineItemsForValidation = await InvoiceLineItem.find({ invoice_id: invoice._id }).lean();
    const validationErrors = validateInvoiceForPosting({
      inv_date: invoice.created_at ? new Date(invoice.created_at).toISOString().split("T")[0] : "valid",
      customer_id: invoice.customer_id ? String(invoice.customer_id) : "",
      print_name: invoice.print_name || "",
      visit_type: (invoice as any).visit_type || "Visitor",
      payment_mode: invoice.payment_mode || "CR",
      line_items: lineItemsForValidation as any,
    });

    if (validationErrors.length > 0) {
      return errorResponse(`Cannot post invoice: ${validationErrors.join(", ")}`, 400);
    }

    const customer = await Customer.findOne({ _id: invoice.customer_id, tenant_id: user.tenant_id });
    if (!customer) return errorResponse("Customer not found", 404);

    // Credit limit check
    if (customer.credit_limit !== null) {
      const newBalance = customer.current_balance + invoice.total_amount;
      if (newBalance > customer.credit_limit) {
        // Check if there's already an approved override
        const approved = await ApprovalRequest.findOne({
          tenant_id: user.tenant_id,
          type: "CreditLimitOverride",
          related_entity_id: invoice._id,
          status: "Approved",
        });

        if (!approved) {
          // Create approval request if none exists
          const existing = await ApprovalRequest.findOne({
            tenant_id: user.tenant_id,
            type: "CreditLimitOverride",
            related_entity_id: invoice._id,
            status: "Pending",
          });

          if (!existing) {
            const approvalReq = await ApprovalRequest.create({
              tenant_id: user.tenant_id,
              type: "CreditLimitOverride",
              related_entity_id: invoice._id,
              requested_by: user.user_id,
              status: "Pending",
            });
            return errorResponse(
              `Credit limit exceeded. Approval required. Request ID: ${approvalReq._id}`,
              409
            );
          }
          return errorResponse(
            `Credit limit exceeded. Pending approval: ${existing._id}`,
            409
          );
        }
      }
    }

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

    return successResponse({ invoice });
  });
}
