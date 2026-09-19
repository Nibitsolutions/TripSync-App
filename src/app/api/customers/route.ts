import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { Customer } from "@/models";
import { logChanges } from "@/lib/audit";
import { generateCustomerCode } from "@/lib/customer-utils";

export async function GET(req: NextRequest) {
  return withAuth(async (user) => {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "100");
    const search = searchParams.get("search");

    const filter: Record<string, unknown> = { tenant_id: user.tenant_id };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
        { ntn_number: { $regex: search, $options: "i" } },
        { spo_name: { $regex: search, $options: "i" } },
      ];
    }

    // Lazy migration / backfill for existing customers without codes
    const unassigned = await Customer.find({ tenant_id: user.tenant_id, $or: [{ code: { $exists: false } }, { code: "" }] });
    if (unassigned.length > 0) {
      for (const cust of unassigned) {
        cust.code = await generateCustomerCode(user.tenant_id);
        await cust.save();
      }
    }

    const [customers, total] = await Promise.all([
      Customer.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Customer.countDocuments(filter),
    ]);

    return successResponse({ customers, total, page, pages: Math.ceil(total / limit) });
  });
}

export async function POST(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json();

    const name = body.name ? String(body.name).trim() : "";
    const code = body.code ? String(body.code).trim() : "";
    const customer_type = body.customer_type ? String(body.customer_type).trim() : "Corporate";
    const gl_account = body.gl_account ? String(body.gl_account).trim() : "101001";
    const spo_name = body.spo_name ? String(body.spo_name).trim() : "SPO 1";

    const missing: string[] = [];
    if (!code) missing.push("Code");
    if (!name) missing.push("Title");
    if (!customer_type) missing.push("Customer Type");
    if (!gl_account) missing.push("GL Account");
    if (!spo_name) missing.push("SPO");

    if (missing.length > 0) {
      return errorResponse(`Required fields missing: ${missing.join(", ")}`, 400);
    }

    const customer = await Customer.create({
      tenant_id: user.tenant_id,
      code,
      name,
      short_name: body.short_name || "",
      details: body.details || "",

      // Customer Information
      parent_customer_id: body.parent_customer_id || null,
      customer_type,
      credit_limit: body.credit_limit !== undefined && body.credit_limit !== null && body.credit_limit !== "" ? parseFloat(body.credit_limit) : null,
      credit_term: body.credit_term || "",
      ntn_number: body.ntn_number || "",
      sale_tax_number: body.sale_tax_number || "",
      date_of_creation: body.date_of_creation || new Date().toISOString().split("T")[0],
      date_expiry: body.date_expiry || "",
      iata_number: body.iata_number || "",

      // Account Information
      gl_account,
      create_auto_ledger: body.create_auto_ledger !== undefined ? Boolean(body.create_auto_ledger) : true,
      visible_to_all_branches: body.visible_to_all_branches !== undefined ? Boolean(body.visible_to_all_branches) : true,
      hide_on_invoices: body.hide_on_invoices !== undefined ? Boolean(body.hide_on_invoices) : false,

      // SPO
      spo_id: body.spo_id || null,
      spo_name,

      // Address Tab
      address_1: body.address_1 || "",
      address_2: body.address_2 || "",
      state: body.state || "",
      zip_code: body.zip_code || "",
      country: body.country || "Pakistan",
      city: body.city || "",
      phone_1: body.phone_1 || body.contact_info?.phone || "",
      phone_2: body.phone_2 || "",
      fax: body.fax || "",

      // Contact Person Tab
      contact_person_name: body.contact_person_name || "",
      contact_person_designation: body.contact_person_designation || "",
      contact_person_phone: body.contact_person_phone || "",
      contact_person_email: body.contact_person_email || body.contact_info?.email || "",

      contact_info: body.contact_info || { phone: body.phone_1, email: body.contact_person_email },
      created_by: user.user_id,
      updated_by: user.user_id,
    });

    await logChanges(
      { tenant_id: user.tenant_id, entity_type: "Customer", entity_id: customer._id, changed_by: user.user_id },
      null,
      customer.toObject()
    );

    return successResponse({ customer }, 201);
  });
}
