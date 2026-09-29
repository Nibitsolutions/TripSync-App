import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { Supplier } from "@/models";
import { logChanges } from "@/lib/audit";
import { parseSupplierPayload } from "@/lib/supplier-utils";

// GET /api/suppliers/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await params;
    const supplier = await Supplier.findOne({ _id: id, tenant_id: user.tenant_id }).lean();
    if (!supplier) return errorResponse("Supplier not found", 404);
    return successResponse({ supplier });
  });
}

// PATCH /api/suppliers/[id] — update the full supplier profile
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await params;
    const supplier = await Supplier.findOne({ _id: id, tenant_id: user.tenant_id });
    if (!supplier) return errorResponse("Supplier not found", 404);

    const body = await req.json();
    const { fields, missing } = parseSupplierPayload(body);
    if (missing.length > 0) return errorResponse(`Required fields missing: ${missing.join(", ")}`, 400);

    const duplicate = await Supplier.findOne({ tenant_id: user.tenant_id, code: fields.code, _id: { $ne: supplier._id } }).select("_id").lean();
    if (duplicate) return errorResponse(`Supplier code "${fields.code}" is already in use`, 400);

    const oldDoc = supplier.toObject();
    supplier.set(fields);
    supplier.updated_by = user.user_id;
    await supplier.save();

    await logChanges(
      { tenant_id: user.tenant_id, entity_type: "Supplier", entity_id: supplier._id, changed_by: user.user_id },
      oldDoc,
      supplier.toObject()
    );

    return successResponse({ supplier });
  }, ["Owner", "Accountant"]);
}
