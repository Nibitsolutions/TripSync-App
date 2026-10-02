import { NextRequest, NextResponse } from "next/server";
import User from "@/models/User";
import { CommissionEarner } from "@/models/platform";
import { withPlatform } from "@/lib/platform/http";

// GET /api/admin/lookups - Names for dropdowns (sales owners, staff, earners)
export async function GET(req: NextRequest) {
  return withPlatform(req, null, async () => {
    const [staff, earners] = await Promise.all([
      User.find({ role: { $in: ["SuperAdmin", "Manager", "SalesExecutive"] } }).select("name email role is_active").sort({ name: 1 }).lean(),
      CommissionEarner.find({}).select("name type is_active platform_user_id").sort({ name: 1 }).lean(),
    ]);
    return NextResponse.json({
      staff: staff.map((s) => ({ id: String(s._id), name: s.name, email: s.email, role: s.role, is_active: s.is_active !== false })),
      sales_executives: staff.filter((s) => s.role === "SalesExecutive" && s.is_active !== false).map((s) => ({ id: String(s._id), name: s.name })),
      earners: earners.map((e) => ({ id: String(e._id), name: e.name, type: e.type, is_active: e.is_active })),
    });
  });
}
