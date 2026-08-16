import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

export async function POST(request: Request) {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "برای پرداخت ابتدا وارد حساب شوید." },
      { status: 401 },
    );
  }
  try {
    const body = await request.json();
    const orderId = String(body.orderId || "");
    if (!orderId) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    const payment = await apiRequest("/v1/payments/zarinpal/start", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: { orderId },
    });
    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "PAYMENT_START_FAILED", message: "شروع پرداخت انجام نشد." },
      { status: 500 },
    );
  }
}
