import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";
import {
  SESSION_COOKIE_BASE_OPTIONS,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session-cookie";

type LoginResponse = {
  token: string;
  expiresAt: string;
  user: { id: string; email: string; role: string };
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await apiRequest<LoginResponse>("/v1/auth/login", {
      method: "POST",
      body: { email: body.email, password: body.password },
    });

    const response = NextResponse.json({ user: result.user });
    response.cookies.set(SESSION_COOKIE_NAME, result.token, {
      ...SESSION_COOKIE_BASE_OPTIONS,
      expires: new Date(result.expiresAt),
    });
    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        {
          error: error.code ?? "LOGIN_FAILED",
          message:
            error.status === 401
              ? "ایمیل یا رمز عبور نادرست است."
              : "ورود انجام نشد. اطلاعات را بررسی کنید.",
        },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "LOGIN_FAILED", message: "ورود انجام نشد." },
      { status: 500 },
    );
  }
}
