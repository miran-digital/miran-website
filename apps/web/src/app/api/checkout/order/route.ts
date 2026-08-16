import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

type OrderInput = {
  addressId: string;
  idempotencyKey: string;
  items: Array<{ productId: string; quantity: number }>;
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
    const idempotencyKey = String(input.idempotencyKey || "");
    const items = Array.isArray(input.items) ? input.items : [];

    if (!addressId || idempotencyKey.length < 8 || items.length === 0 || items.length > 100) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const normalizedItems = items.map((item) => ({
      productId: String(item.productId || ""),
      quantity: Number(item.quantity),
    }));
    if (
      normalizedItems.some(
        (item) =>
          !item.productId ||
          !Number.isSafeInteger(item.quantity) ||
          item.quantity < 1 ||
          item.quantity > 100,
      )
    ) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const order = await apiRequest("/v1/orders", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: { addressId, idempotencyKey, items: normalizedItems },
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
