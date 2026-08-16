import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

type MergeInput = { items?: Array<{ productId?: unknown; quantity?: unknown }> };

export async function POST(request: Request) {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const body = (await request.json()) as MergeInput;
    const items = Array.isArray(body.items)
      ? body.items.map((item) => ({
          productId: String(item.productId || ""),
          quantity: Number(item.quantity),
        }))
      : [];
    if (
      items.length > 100 ||
      items.some(
        (item) =>
          !item.productId ||
          !Number.isSafeInteger(item.quantity) ||
          item.quantity < 1 ||
          item.quantity > 1000,
      )
    ) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }
    const cart = await apiRequest("/v1/cart/merge", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: { items },
    });
    return NextResponse.json({ cart });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "CART_MERGE_FAILED", message: "انتقال سبد مهمان انجام نشد." },
      { status: 500 },
    );
  }
}
