import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "./auth";
import { connectDB } from "./mongodb";
import { enforceTenantAccess } from "./platform/tenant-guard";
import { isPlatformRole } from "./platform/permissions";

export interface SessionUser {
  user_id: string;
  tenant_id: string;
  role: string;
  name: string;
  email: string;
  session_epoch?: number;
}

export async function getAuthSession(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  const user = session?.user as unknown as SessionUser | undefined;
  if (!user?.user_id) return null;
  return user;
}

export async function withAuth(
  handler: (user: SessionUser) => Promise<NextResponse>,
  requiredRoles?: string[],
  options: { allowWhenExpired?: boolean } = {}
): Promise<NextResponse> {
  try {
    await connectDB();
  } catch (err) {
    console.error("[api] database connection failed", err);
    return errorResponse("Could not connect to the database. Please try again shortly.", 503);
  }
  const user = await getAuthSession();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Agency endpoints are scoped by tenant_id. Platform staff have none, and a missing
  // tenant filter would match every agency's records, so they are refused outright.
  if (!user.tenant_id || isPlatformRole(user.role)) {
    return NextResponse.json(
      { error: "This is a platform admin account. Agency features are only available to agency users." },
      { status: 403 }
    );
  }

  // Agency users pass through the maintenance + subscription access guard.
  const denied = await enforceTenantAccess(user, options);
  if (denied) return denied;

  if (requiredRoles && !requiredRoles.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    return await handler(user);
  } catch (err) {
    return unexpectedErrorResponse(err);
  }
}

// Turn an uncaught error inside a route into a JSON error the UI can show, instead of an
// empty 500 page that surfaces as a confusing "unexpected response" on the client.
export function unexpectedErrorResponse(err: unknown) {
  const e = err as { name?: string; code?: number; message?: string; keyValue?: Record<string, unknown>; errors?: Record<string, { message?: string }> };
  if (e?.name === "ValidationError") {
    const messages = Object.values(e.errors || {}).map((x) => x.message).filter(Boolean);
    return errorResponse(messages.length ? messages.join(", ") : "Some fields have invalid values", 400);
  }
  if (e?.name === "CastError") return errorResponse("Invalid value or ID in the request", 400);
  if (e?.code === 11000) {
    const field = Object.keys(e.keyValue || {})[0];
    return errorResponse(field ? `A record with this ${field.replace(/_/g, " ")} already exists` : "A record with the same value already exists", 409);
  }
  if (e instanceof SyntaxError) return errorResponse("Invalid request data", 400);
  console.error("[api] unhandled error", err);
  return errorResponse("Something went wrong on the server. Please try again.", 500);
}

export function errorResponse(message: string, status: number = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function successResponse(data: unknown, status: number = 200) {
  return NextResponse.json(data, { status });
}
