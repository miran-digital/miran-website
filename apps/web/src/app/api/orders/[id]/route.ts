import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  try {
    const order = await apiRequest(`/v1/orders/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "ORDER_DETAIL_FAILED", message: "دریافت سفارش انجام نشد." },
      { status: 500 },
    );
  }
}
