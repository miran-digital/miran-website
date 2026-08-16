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
    { error: "SHIPPING_ADMIN_FAILED", message: "عملیات روش ارسال انجام نشد." },
    { status: 500 },
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const { id } = await context.params;
    const method = await apiRequest(
      `/v1/admin/shipping-methods/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}` },
        body: await request.json(),
      },
    );
    return NextResponse.json({ method });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const { id } = await context.params;
    const result = await apiRequest(
      `/v1/admin/shipping-methods/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      },
    );
    return NextResponse.json(result);
  } catch (error) {
    return failure(error);
  }
}
