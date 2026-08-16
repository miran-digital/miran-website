import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

async function token() {
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
    { error: "CART_REQUEST_FAILED", message: "عملیات سبد خرید انجام نشد." },
    { status: 500 },
  );
}

export async function GET() {
  const session = await token();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const cart = await apiRequest("/v1/cart", {
      headers: { authorization: `Bearer ${session}` },
    });
    return NextResponse.json({ cart });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE() {
  const session = await token();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const cart = await apiRequest("/v1/cart", {
      method: "DELETE",
      headers: { authorization: `Bearer ${session}` },
    });
    return NextResponse.json({ cart });
  } catch (error) {
    return failure(error);
  }
}
