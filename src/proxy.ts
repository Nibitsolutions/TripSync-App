import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Forwards the request method and path to route handlers so the tenant access
// guard in `withAuth` can apply the read-only policy for expired agencies
// (architecture §6.1). Always overwritten here, so clients cannot spoof them.
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-ts-method", request.method);
  headers.set("x-ts-path", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
