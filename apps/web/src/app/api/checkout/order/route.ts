import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

type OrderInput = {
  addressId: string;
  shippingMethodCode: string;
  idempotencyKey: string;
};

export async function POST(request: Request) {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "برای ثبت سفارش ابتدا وارد حساب شوید." },
      { status: 401 },
    );
  }

  try {
    const input = (await request.json()) as Partial<OrderInput>;
    const addressId = String(input.addressId || "");
    const shippingMethodCode = String(input.shippingMethodCode || "");
    const idempotencyKey = String(input.idempotencyKey || "");

    if (!addressId || !shippingMethodCode || idempotencyKey.length < 8) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const order = await apiRequest("/v1/checkout/orders", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: { addressId, shippingMethodCode, idempotencyKey },
    });
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "ORDER_CREATE_FAILED", message: "ثبت سفارش انجام نشد." },
      { status: 500 },
    );
  }
}
