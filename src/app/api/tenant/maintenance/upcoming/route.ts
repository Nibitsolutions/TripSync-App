import { NextResponse } from "next/server";
import { withTenant } from "@/lib/platform/tenant-guard";
import { getMaintenanceSnapshot } from "@/lib/platform/maintenance";

// GET /api/tenant/maintenance/upcoming - Scheduled window info for the in-app banner
export async function GET() {
  return withTenant(async () => {
    const snap = await getMaintenanceSnapshot();
    const up = snap.upcoming && new Date(snap.upcoming.notify_in_app_from) <= new Date() ? snap.upcoming : null;
    return NextResponse.json({ upcoming: up });
  });
}
