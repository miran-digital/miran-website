import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

export async function POST(request: Request) {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  try {
    const body = await request.json();
    const action = String(body.action || "");
    const path = action === "content"
      ? "/v1/admin/legacy-preview/content"
      : action === "product"
        ? "/v1/admin/legacy-preview/product"
        : "";
    if (!path) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

    const result = await apiRequest(path, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: body.data ?? {},
    });
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "LEGACY_IMPORT_FAILED", message: "انتقال کنترل‌شده Preview انجام نشد." },
      { status: 500 },
    );
  }
}
