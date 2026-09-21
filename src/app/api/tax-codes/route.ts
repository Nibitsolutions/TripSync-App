import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { TaxCode } from "@/models";

const DEFAULT_TAX_CODES = [
  { name: "Passenger Service Fee", code: "PSF", category: "Airline Tax", default_percentage: null },
  { name: "Withholding Tax", code: "WHT", category: "WHT", default_percentage: 10 },
  { name: "Airport Tax", code: "APT", category: "Airline Tax", default_percentage: null },
  { name: "Civil Aviation Tax", code: "CVT", category: "Airline Tax", default_percentage: null },
  { name: "Provincial Sales Tax / SST", code: "SST", category: "Other Taxes", default_percentage: 13 },
  { name: "Advance Tax (Income Tax)", code: "ADV_TAX", category: "Income Tax", default_percentage: 5 },
  { name: "Airline Fuel Surcharge", code: "YQ", category: "Airline Tax", default_percentage: null },
  { name: "Pakistan Departure Tax", code: "PK", category: "Airline Tax", default_percentage: null },
  { name: "City Tax", code: "CITY_TAX", category: "Other Taxes", default_percentage: 10 },
  { name: "RG Tax", code: "RG", category: "Airline Tax", default_percentage: null },
];

export async function GET() {
  return withAuth(async (user) => {
    let taxCodes = await TaxCode.find({ tenant_id: user.tenant_id }).sort({ code: 1 }).lean();

    if (taxCodes.length === 0) {
      // Seed default initial tax codes
      const docs = DEFAULT_TAX_CODES.map((t) => ({
        tenant_id: user.tenant_id,
        name: t.name,
        code: t.code,
        category: t.category,
        default_percentage: t.default_percentage,
        active: true,
        created_by: user.user_id,
      }));
      await TaxCode.insertMany(docs);
      taxCodes = await TaxCode.find({ tenant_id: user.tenant_id }).sort({ code: 1 }).lean();
    }

    return successResponse({ tax_codes: taxCodes });
  });
}

export async function POST(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json();
    const { name, code, category, default_percentage } = body;

    if (!name || !code || !category) {
      return errorResponse("Tax Name, Tax Code, and Tax Category are required");
    }

    const validCategories = ["Income Tax", "WHT", "Airline Tax", "Other Taxes"];
    if (!validCategories.includes(category)) {
      return errorResponse(`Category must be one of: ${validCategories.join(", ")}`);
    }

    const parsePct = default_percentage !== undefined && default_percentage !== null && default_percentage !== ""
      ? parseFloat(default_percentage)
      : null;

    const taxCode = await TaxCode.create({
      tenant_id: user.tenant_id,
      name: name.trim(),
      code: code.trim().toUpperCase(),
      category,
      default_percentage: isNaN(parsePct as number) ? null : parsePct,
      active: true,
      created_by: user.user_id,
    });

    return successResponse({ tax_code: taxCode }, 201);
  }, ["Owner", "Accountant"]);
}
