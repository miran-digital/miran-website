import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

export async function GET(request: Request) {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const input = new URL(request.url);
    const params = new URLSearchParams();
    const status = input.searchParams.get("status");
    if (status) params.set("status", status.slice(0, 60));
    const suffix = params.size ? `?${params.toString()}` : "";
    const orders = await apiRequest(`/v1/admin/orders${suffix}`, {
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
      { error: "ADMIN_ORDERS_FAILED", message: "دریافت سفارش‌ها انجام نشد." },
      { status: 500 },
    );
  }
}
