import { NextResponse } from "next/server";
import Tenant from "@/models/Tenant";
import User from "@/models/User";
import { Order } from "@/models/platform";
import { withTenant } from "@/lib/platform/tenant-guard";
import { getEffectiveStatus } from "@/lib/platform/lifecycle";
import { getMaintenanceSnapshot } from "@/lib/platform/maintenance";
import { getSetting } from "@/lib/platform/settings";
import { daysLeft } from "@/lib/platform/db";

// GET /api/tenant/subscription - Status, expiry, limits/usage, banner flags, upcoming maintenance
export async function GET() {
  return withTenant(async (user) => {
    const agency = await Tenant.findById(user.tenant_id).lean();
    if (!agency) return NextResponse.json({ error: "Agency not found" }, { status: 404 });
    const status = getEffectiveStatus(agency);
    const [usersUsed, pending, maintenance, support, payment] = await Promise.all([
      User.countDocuments({ tenant_id: agency._id, is_active: { $ne: false } }),
      Order.findOne({ agency_id: agency._id, status: "PENDING" }).select("order_number payment_reference total_due type created_at").lean(),
      getMaintenanceSnapshot(),
      getSetting("support_contact"),
      getSetting("payment_instructions"),
    ]);
    const left = daysLeft(agency.access_expires_at);
    const now = new Date();
    const upcoming = maintenance.upcoming && new Date(maintenance.upcoming.notify_in_app_from) <= now ? maintenance.upcoming : null;
    return NextResponse.json({
      agency: { id: String(agency._id), name: agency.name },
      status,
      expires_at: agency.access_expires_at,
      days_left: left,
      is_trial: status === "TRIAL",
      limits: { seats: agency.max_users, branches: agency.branch_limit ?? 1 },
      usage: { seats: usersUsed, branches: 1 },
      banners: {
        expired: status === "EXPIRED",
        expiring_soon: (status === "ACTIVE" || status === "TRIAL") && left !== null && left <= 21,
        maintenance_upcoming: Boolean(upcoming),
      },
      upcoming_maintenance: upcoming,
      pending_order: pending,
      support_contact: support,
      payment_instructions: payment,
      is_owner: user.role === "Owner",
    });
  });
}
