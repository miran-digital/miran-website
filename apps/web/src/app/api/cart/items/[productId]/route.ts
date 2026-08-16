import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value;
}

function failure(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: "CART_LINE_FAILED", message: "به‌روزرسانی سبد انجام نشد." },
    { status: 500 },
  );
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ productId: string }> },
) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const { productId } = await context.params;
    const body = (await request.json()) as { quantity?: unknown };
    const quantity = Number(body.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1000) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }
    const cart = await apiRequest(
      `/v1/cart/items/${encodeURIComponent(productId)}`,
      {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
        body: { quantity },
      },
    );
    return NextResponse.json({ cart });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ productId: string }> },
) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const { productId } = await context.params;
    const cart = await apiRequest(
      `/v1/cart/items/${encodeURIComponent(productId)}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      },
    );
    return NextResponse.json({ cart });
  } catch (error) {
    return failure(error);
  }
}
