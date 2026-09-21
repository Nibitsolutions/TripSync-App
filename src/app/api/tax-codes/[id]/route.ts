import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { TaxCode } from "@/models";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  return withAuth(async (user) => {
    const { id } = await params;
    const body = await req.json();
    const { name, code, category, default_percentage, active } = body;

    const taxCode = await TaxCode.findOne({ _id: id, tenant_id: user.tenant_id });
    if (!taxCode) return errorResponse("Tax Code not found", 404);

    if (name !== undefined) taxCode.name = String(name).trim();
    if (code !== undefined) taxCode.code = String(code).trim().toUpperCase();
    if (category !== undefined) {
      const validCategories = ["Income Tax", "WHT", "Airline Tax", "Other Taxes"];
      if (!validCategories.includes(category)) {
        return errorResponse(`Category must be one of: ${validCategories.join(", ")}`);
      }
      taxCode.category = category;
    }
    if (default_percentage !== undefined) {
      if (default_percentage === null || default_percentage === "") {
        taxCode.default_percentage = null;
      } else {
        const val = parseFloat(default_percentage);
        taxCode.default_percentage = isNaN(val) ? null : val;
      }
    }
    if (active !== undefined) taxCode.active = Boolean(active);
    taxCode.updated_by = user.user_id;

    await taxCode.save();

    return successResponse({ tax_code: taxCode });
  }, ["Owner", "Accountant"]);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return withAuth(async (user) => {
    const { id } = await params;
    const taxCode = await TaxCode.findOneAndDelete({ _id: id, tenant_id: user.tenant_id });
    if (!taxCode) return errorResponse("Tax Code not found", 404);

    return successResponse({ message: "Tax Code deleted" });
  }, ["Owner", "Accountant"]);
}
