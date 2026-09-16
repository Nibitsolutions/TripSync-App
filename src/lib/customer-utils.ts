import { Customer } from "@/models";
import mongoose, { Types } from "mongoose";

/**
 * Generate next sequential Customer Code (e.g., CUST-000001, CUST-000002) for a given tenant.
 */
export async function generateCustomerCode(tenantId: Types.ObjectId | string): Promise<string> {
  const count = await Customer.countDocuments({ tenant_id: tenantId });
  let num = count + 1;
  let code = `CUST-${String(num).padStart(6, "0")}`;

  while (await Customer.findOne({ tenant_id: tenantId, code })) {
    num++;
    code = `CUST-${String(num).padStart(6, "0")}`;
  }

  return code;
}

/**
 * Resolve an existing customer ObjectId or Customer Name.
 * If customerInput is a valid ObjectId and exists, returns that ObjectId.
 * If customerInput is a name and matches an existing customer (case-insensitive), returns that customer's ObjectId.
 * If customerInput is a new name, creates a new Customer in DB with auto-generated Customer Code and returns the new ObjectId.
 */
export async function resolveOrCreateCustomer(
  tenantId: Types.ObjectId | string,
  customerInput: string,
  userId: Types.ObjectId | string
): Promise<mongoose.Types.ObjectId> {
  const trimmed = customerInput ? String(customerInput).trim() : "";
  if (!trimmed) {
    throw new Error("Customer name or ID is required");
  }

  // 1. Check if trimmed is already a valid MongoDB ObjectId
  if (mongoose.Types.ObjectId.isValid(trimmed) && String(new mongoose.Types.ObjectId(trimmed)) === trimmed) {
    const existing = await Customer.findOne({ _id: trimmed, tenant_id: tenantId });
    if (existing) return existing._id;
  }

  // 2. Check by name or code (case-insensitive exact match)
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const existingByNameOrCode = await Customer.findOne({
    tenant_id: tenantId,
    $or: [
      { name: { $regex: `^${escaped}$`, $options: "i" } },
      { code: { $regex: `^${escaped}$`, $options: "i" } },
    ],
  });

  if (existingByNameOrCode) {
    return existingByNameOrCode._id;
  }

  // 3. Create new Customer record in DB with auto-assigned code
  const code = await generateCustomerCode(tenantId);
  const newCust = await Customer.create({
    tenant_id: tenantId,
    name: trimmed,
    code,
    created_by: userId,
    updated_by: userId,
  });

  return newCust._id;
}
