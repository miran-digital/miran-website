import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

async function tokenOrNull() {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null;
}

function respondError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: "CATEGORY_REQUEST_FAILED", message: "عملیات دسته‌بندی انجام نشد." },
    { status: 500 },
  );
}

export async function GET() {
  const token = await tokenOrNull();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const categories = await apiRequest("/v1/admin/categories", {
      headers: { authorization: `Bearer ${token}` },
    });
    return NextResponse.json({ categories });
  } catch (error) {
    return respondError(error);
  }
}

export async function POST(request: Request) {
  const token = await tokenOrNull();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const category = await apiRequest("/v1/admin/categories", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: await request.json(),
    });
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    return respondError(error);
  }
}

export async function PATCH(request: Request) {
  const token = await tokenOrNull();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const body = await request.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    const category = await apiRequest(`/v1/admin/categories/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}` },
      body: body.data ?? {},
    });
    return NextResponse.json({ category });
  } catch (error) {
    return respondError(error);
  }
}

export async function DELETE(request: Request) {
  const token = await tokenOrNull();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const body = await request.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    const result = await apiRequest(`/v1/admin/categories/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    return NextResponse.json({ result });
  } catch (error) {
    return respondError(error);
  }
}
