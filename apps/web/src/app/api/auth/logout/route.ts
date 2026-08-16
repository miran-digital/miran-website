import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiRequest } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    try {
      await apiRequest("/v1/auth/logout", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
    } catch {
      // Always clear the browser cookie even if the backend session is already gone.
    }
  }

  const response = new NextResponse(null, { status: 204 });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
