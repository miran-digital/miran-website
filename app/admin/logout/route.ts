import { NextResponse } from "next/server";
import {
  adminOwnerSessionCookie,
  adminOwnerSessionCookieOptions,
  closeCurrentOwnerPasswordSession,
} from "@/lib/admin-owner-session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await closeCurrentOwnerPasswordSession();
  const response = NextResponse.redirect(new URL("/admin/login", request.url));
  response.cookies.set(adminOwnerSessionCookie, "", {
    ...adminOwnerSessionCookieOptions,
    maxAge: 0,
  });
  response.headers.set("cache-control", "private, no-store");
  return response;
}
