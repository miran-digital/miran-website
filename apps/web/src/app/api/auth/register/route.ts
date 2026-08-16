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
    await apiRequest("/v1/auth/register", {
      method: "POST",
      body: { email: body.email, password: body.password },
    });
    const result = await apiRequest<LoginResponse>("/v1/auth/login", {
      method: "POST",
      body: { email: body.email, password: body.password },
    });

    const response = NextResponse.json({ user: result.user }, { status: 201 });
    response.cookies.set(SESSION_COOKIE_NAME, result.token, {
      ...SESSION_COOKIE_BASE_OPTIONS,
      expires: new Date(result.expiresAt),
    });
    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        {
          error: error.code ?? "REGISTER_FAILED",
          message:
            error.status === 409
              ? "این ایمیل قبلاً ثبت شده است."
              : "ثبت‌نام انجام نشد. اطلاعات را بررسی کنید.",
        },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "REGISTER_FAILED", message: "ثبت‌نام انجام نشد." },
      { status: 500 },
    );
  }
}
