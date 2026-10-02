import { NextRequest, NextResponse } from "next/server";
import { withPlatform, toCsv, csvResponse } from "@/lib/platform/http";
import { overviewSummary, salesExecSummary } from "@/lib/platform/metrics";
import { can } from "@/lib/platform/permissions";

function parseRange(url: URL) {
  const now = new Date();
  const fromQ = url.searchParams.get("from");
  const toQ = url.searchParams.get("to");
  const from = fromQ ? new Date(`${fromQ}T00:00:00+05:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = toQ ? new Date(`${toQ}T23:59:59.999+05:00`) : now;
  return { from, to };
}

// GET /api/admin/overview?from&to - Aggregate business numbers (Sales Executives get their own stats)
// ?format=csv exports the headline metrics.
export async function GET(req: NextRequest) {
  return withPlatform(req, null, async (ctx) => {
    const url = new URL(req.url);
    const range = parseRange(url);
    if (!can(ctx.user.role, "analytics.read")) {
      return NextResponse.json({ scope: "own", summary: await salesExecSummary(ctx.user.id, range) });
    }
    const summary = await overviewSummary(range);
    if (url.searchParams.get("format") === "csv") {
      const rows = [
        { metric: "revenue_collected", value: summary.revenue_collected },
        { metric: "orders_approved", value: summary.orders_approved },
        { metric: "cash_pending", value: summary.cash_pending.total },
        { metric: "new_agencies", value: summary.new_agencies.total },
        { metric: "trials_started", value: summary.trials.started },
        { metric: "trials_converted", value: summary.trials.converted },
        ...Object.entries(summary.status_counts).map(([k, v]) => ({ metric: `agencies_${k.toLowerCase()}`, value: v })),
        { metric: "expiring_7d", value: summary.expiring.d7 },
        { metric: "expiring_30d", value: summary.expiring.d30 },
        { metric: "churn", value: summary.churn },
        { metric: "discounts_given", value: summary.discounts.total },
        { metric: "commission_accrued", value: summary.commissions.accrued },
        { metric: "commission_paid", value: summary.commissions.paid },
        { metric: "commission_outstanding", value: summary.commissions.outstanding },
        { metric: "costs_total", value: summary.costs.total },
        { metric: "net", value: summary.net },
        { metric: "recurring_run_rate_monthly", value: summary.recurring_run_rate },
      ];
      return csvResponse("overview.csv", toCsv(rows, ["metric", "value"]));
    }
    return NextResponse.json({ scope: "all", summary });
  });
}
