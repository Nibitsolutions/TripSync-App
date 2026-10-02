import { NextResponse } from "next/server";
import Tenant from "@/models/Tenant";
import { MarketingConsent } from "@/models/platform";
import { withErrors, readJson, requestMeta, ApiError } from "@/lib/platform/http";
import { verifySignedValue } from "@/lib/platform/crypto";
import { writeAudit } from "@/lib/platform/audit";

// POST /api/public/unsubscribe - Marketing unsubscribe via signed token
export async function POST(req: Request) {
  return withErrors(async () => {
    const { token } = await readJson<{ token?: string }>(req);
    const value = token ? verifySignedValue(token) : null;
    if (!value?.startsWith("unsub:")) throw new ApiError(400, "INVALID_TOKEN", "This unsubscribe link is invalid");
    const email = value.slice(6);
    await MarketingConsent.updateOne(
      { email },
      { $set: { marketing_consent: false, unsubscribed_at: new Date() }, $setOnInsert: { data_consent: false, captured_at: new Date() } },
      { upsert: true }
    );
    await Tenant.updateMany({ owner_email: email }, { $set: { marketing_consent: false } });
    await writeAudit({ kind: "public", meta: requestMeta(req) }, { action: "consent.unsubscribe", entity_type: "marketing_consent", entity_id: email });
    return NextResponse.json({ ok: true, email });
  });
}
