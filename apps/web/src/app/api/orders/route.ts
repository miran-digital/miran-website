import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const orders = await apiRequest("/v1/orders", {
      headers: { authorization: `Bearer ${token}` },
    });
    return NextResponse.json({ orders });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "ORDER_HISTORY_FAILED", message: "دریافت سفارش‌ها انجام نشد." },
      { status: 500 },
    );
  }
}
