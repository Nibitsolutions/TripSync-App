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
  await connectDB();
  const user = await getAuthSession();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Agency users pass through the maintenance + subscription access guard.
  if (user.tenant_id && !isPlatformRole(user.role)) {
    const denied = await enforceTenantAccess(user, options);
    if (denied) return denied;
  }

  if (requiredRoles && !requiredRoles.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return handler(user);
}

export function errorResponse(message: string, status: number = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function successResponse(data: unknown, status: number = 200) {
  return NextResponse.json(data, { status });
}
