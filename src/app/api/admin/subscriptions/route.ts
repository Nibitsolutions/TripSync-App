import { NextRequest } from "next/server";
import { withPlatform, pagination, listResponse, agencyScope } from "@/lib/platform/http";
import { listAgencies } from "@/lib/platform/agency-query";
import { effectiveStatusCondition } from "@/lib/platform/agency-query";

// GET /api/admin/subscriptions?view=expiring|expired|suspended|trial_ending|offboarded|all
// Agency-level grid of subscription states.
export async function GET(req: NextRequest) {
  return withPlatform(req, "agencies.read", async (ctx) => {
    const url = new URL(req.url);
    const view = url.searchParams.get("view") || "expiring";
    const now = new Date();
    const days = (n: number) => new Date(now.getTime() + n * 86_400_000);
    let cond: Record<string, unknown>;
    let sort: Record<string, 1 | -1> = { access_expires_at: 1 };
    switch (view) {
      case "expiring":
        cond = { status: { $in: ["ACTIVE", "TRIAL"] }, access_expires_at: { $gt: now, $lte: days(30) } };
        break;
      case "expired":
        cond = effectiveStatusCondition("EXPIRED", now);
        sort = { access_expires_at: -1 };
        break;
      case "suspended":
        cond = { status: "SUSPENDED" };
        sort = { suspended_at: -1 };
        break;
      case "trial_ending":
        cond = { status: "TRIAL", access_expires_at: { $gt: now, $lte: days(2) } };
        break;
      case "offboarded":
        cond = { status: "OFFBOARDED" };
        sort = { offboarded_at: -1 };
        break;
      default:
        cond = { status: { $in: ["TRIAL", "ACTIVE", "EXPIRED", "SUSPENDED"] } };
    }
    const filter = { $and: [agencyScope(ctx.user), cond] };
    const { page, page_size, skip } = pagination(url);
    const { rows, total } = await listAgencies(filter, sort, skip, page_size);
    return listResponse(rows, page, page_size, total);
  });
}
