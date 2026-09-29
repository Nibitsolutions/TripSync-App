import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { Supplier } from "@/models";
import { logChanges } from "@/lib/audit";
import { parseSupplierPayload } from "@/lib/supplier-utils";

// GET /api/suppliers — list all suppliers
export async function GET(req: NextRequest) {
  return withAuth(async (user) => {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const search = searchParams.get("search");

    const filter: Record<string, unknown> = { tenant_id: user.tenant_id };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
        { short_name: { $regex: search, $options: "i" } },
      ];
    }

    const [suppliers, total] = await Promise.all([
      Supplier.find(filter)
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Supplier.countDocuments(filter),
    ]);

    return successResponse({ suppliers, total, page, pages: Math.ceil(total / limit) });
  });
}

// POST /api/suppliers — create a new supplier
export async function POST(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json();
    const { fields, missing } = parseSupplierPayload(body);

    if (missing.length > 0) return errorResponse(`Required fields missing: ${missing.join(", ")}`, 400);

    const duplicate = await Supplier.findOne({ tenant_id: user.tenant_id, code: fields.code }).select("_id").lean();
    if (duplicate) return errorResponse(`Supplier code "${fields.code}" is already in use`, 400);

    const supplier = await Supplier.create({
      tenant_id: user.tenant_id,
      ...fields,
      current_balance: 0,
      created_by: user.user_id,
      updated_by: user.user_id,
    });

    await logChanges(
      { tenant_id: user.tenant_id, entity_type: "Supplier", entity_id: supplier._id, changed_by: user.user_id },
      null,
      supplier.toObject()
    );

    return successResponse({ supplier }, 201);
  }, ["Owner", "Accountant"]);
}
