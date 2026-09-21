import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { Customer, Invoice } from "@/models";
import { logChanges } from "@/lib/audit";

// GET /api/customers/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await params;
    const customer = await Customer.findOne({ _id: id, tenant_id: user.tenant_id }).lean();
    if (!customer) return errorResponse("Customer not found", 404);
    return successResponse({ customer });
  });
}

// PATCH /api/customers/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await params;
    const customer = await Customer.findOne({ _id: id, tenant_id: user.tenant_id });
    if (!customer) return errorResponse("Customer not found", 404);

    const body = await req.json();
    const oldDoc = customer.toObject();

    const name = body.name !== undefined ? String(body.name).trim() : customer.name;
    const code = body.code !== undefined ? String(body.code).trim() : customer.code;
    const customer_type = body.customer_type !== undefined ? String(body.customer_type).trim() : customer.customer_type;
    const gl_account = body.gl_account !== undefined ? String(body.gl_account).trim() : customer.gl_account;
    const spo_name = body.spo_name !== undefined ? String(body.spo_name).trim() : customer.spo_name;

    const missing: string[] = [];
    if (!code) missing.push("Code");
    if (!name) missing.push("Title");
    if (!customer_type) missing.push("Customer Type");
    if (!gl_account) missing.push("GL Account");
    if (!spo_name) missing.push("SPO");

    if (missing.length > 0) {
      return errorResponse(`Required fields missing: ${missing.join(", ")}`, 400);
    }

    // Apply updates
    customer.name = name;
    customer.code = code;
    customer.customer_type = customer_type;
    customer.gl_account = gl_account;
    customer.spo_name = spo_name;

    if (body.short_name !== undefined) customer.short_name = body.short_name;
    if (body.details !== undefined) customer.details = body.details;
    if (body.parent_customer_id !== undefined) customer.parent_customer_id = body.parent_customer_id || null;
    if (body.credit_limit !== undefined) customer.credit_limit = body.credit_limit !== null && body.credit_limit !== "" ? parseFloat(body.credit_limit) : null;
    if (body.credit_term !== undefined) customer.credit_term = body.credit_term;
    if (body.ntn_number !== undefined) customer.ntn_number = body.ntn_number;
    if (body.sale_tax_number !== undefined) customer.sale_tax_number = body.sale_tax_number;
    if (body.date_of_creation !== undefined) customer.date_of_creation = body.date_of_creation;
    if (body.date_expiry !== undefined) customer.date_expiry = body.date_expiry;
    if (body.iata_number !== undefined) customer.iata_number = body.iata_number;

    if (body.create_auto_ledger !== undefined) customer.create_auto_ledger = Boolean(body.create_auto_ledger);
    if (body.visible_to_all_branches !== undefined) customer.visible_to_all_branches = Boolean(body.visible_to_all_branches);
    if (body.hide_on_invoices !== undefined) customer.hide_on_invoices = Boolean(body.hide_on_invoices);

    if (body.spo_id !== undefined) customer.spo_id = body.spo_id || null;

    if (body.address_1 !== undefined) customer.address_1 = body.address_1;
    if (body.address_2 !== undefined) customer.address_2 = body.address_2;
    if (body.state !== undefined) customer.state = body.state;
    if (body.zip_code !== undefined) customer.zip_code = body.zip_code;
    if (body.country !== undefined) customer.country = body.country;
    if (body.city !== undefined) customer.city = body.city;
    if (body.phone_1 !== undefined) customer.phone_1 = body.phone_1;
    if (body.phone_2 !== undefined) customer.phone_2 = body.phone_2;
    if (body.fax !== undefined) customer.fax = body.fax;

    if (body.contact_person_name !== undefined) customer.contact_person_name = body.contact_person_name;
    if (body.contact_person_designation !== undefined) customer.contact_person_designation = body.contact_person_designation;
    if (body.contact_person_phone !== undefined) customer.contact_person_phone = body.contact_person_phone;
    if (body.contact_person_email !== undefined) customer.contact_person_email = body.contact_person_email;

    customer.contact_info = {
      phone: customer.phone_1 || customer.contact_person_phone,
      email: customer.contact_person_email,
    };

    customer.updated_by = user.user_id;
    await customer.save();

    await logChanges(
      { tenant_id: user.tenant_id, entity_type: "Customer", entity_id: customer._id, changed_by: user.user_id },
      oldDoc,
      customer.toObject()
    );

    return successResponse({ customer });
  });
}

// DELETE /api/customers/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await params;

    // Check if customer has associated invoices
    const invoiceCount = await Invoice.countDocuments({ customer_id: id, tenant_id: user.tenant_id });
    if (invoiceCount > 0) {
      return errorResponse(
        `Cannot delete customer because ${invoiceCount} invoice(s) are linked to this customer account.`,
        400
      );
    }

    const customer = await Customer.findOneAndDelete({ _id: id, tenant_id: user.tenant_id });
    if (!customer) return errorResponse("Customer not found", 404);
    return successResponse({ message: "Customer deleted successfully" });
  });
}
