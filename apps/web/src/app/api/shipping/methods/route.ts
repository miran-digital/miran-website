import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

export async function GET(request: Request) {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const addressId = url.searchParams.get("addressId") || "";
    const merchandiseTotalIrr = url.searchParams.get("merchandiseTotalIrr") || "";
    if (!addressId) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    const query = new URLSearchParams({ addressId });
    if (merchandiseTotalIrr) query.set("merchandiseTotalIrr", merchandiseTotalIrr);
    const methods = await apiRequest(`/v1/shipping/methods?${query.toString()}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    return NextResponse.json({ methods });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "SHIPPING_REQUEST_FAILED", message: "دریافت روش‌های ارسال انجام نشد." },
      { status: 500 },
    );
  }
}
