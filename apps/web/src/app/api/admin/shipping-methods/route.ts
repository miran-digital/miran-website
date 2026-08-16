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
    { error: "SHIPPING_ADMIN_FAILED", message: "عملیات روش ارسال انجام نشد." },
    { status: 500 },
  );
}

export async function GET() {
  const session = await token();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const methods = await apiRequest("/v1/admin/shipping-methods", {
      headers: { authorization: `Bearer ${session}` },
    });
    return NextResponse.json({ methods });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const session = await token();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const method = await apiRequest("/v1/admin/shipping-methods", {
      method: "POST",
      headers: { authorization: `Bearer ${session}` },
      body: await request.json(),
    });
    return NextResponse.json({ method }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
