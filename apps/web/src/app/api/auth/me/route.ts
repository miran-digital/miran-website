import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

type CurrentUser = { id: string; email: string; role: string };

export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  try {
    const user = await apiRequest<CurrentUser>("/v1/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const response = NextResponse.json({ user: null }, { status: 401 });
      response.cookies.delete(SESSION_COOKIE_NAME);
      return response;
    }
    return NextResponse.json(
      { error: "SESSION_LOOKUP_FAILED" },
      { status: 502 },
    );
  }
}
