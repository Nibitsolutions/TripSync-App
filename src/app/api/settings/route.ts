import { NextRequest } from "next/server";
import { withAuth, successResponse, errorResponse } from "@/lib/api-helpers";
import { Tenant } from "@/models";

// GET /api/settings
export async function GET() {
  return withAuth(async (user) => {
    const tenant = await Tenant.findById(user.tenant_id).lean();
    if (!tenant) return errorResponse("Tenant not found", 404);
    return successResponse({ settings: tenant });
  });
}

// PATCH /api/settings
export async function PATCH(req: NextRequest) {
  return withAuth(async (user) => {
    const body = await req.json();
    const allowed = [
      "name", "logo_url", "address", "city", "contact_person",
      "contact_email", "contact_phone", "website", "tagline",
      "invoice_notes", "base_currency",
    ];
    const update: Record<string, string> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) update[key] = body[key];
    }
    const tenant = await Tenant.findByIdAndUpdate(
      user.tenant_id,
      { $set: update },
      { new: true }
    ).lean();
    return successResponse({ settings: tenant });
  });
}
