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
    if (!body.name) return errorResponse("Name is required");

    const code = body.code?.trim() || await generateCustomerCode(user.tenant_id);

    const customer = await Customer.create({
      tenant_id: user.tenant_id,
      name: body.name.trim(),
      code,
      contact_info: body.contact_info || {},
      credit_limit: body.credit_limit ?? null,
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
