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
    { error: "STOREFRONT_CMS_FAILED", message: "عملیات محتوای فروشگاه انجام نشد." },
    { status: 500 },
  );
}

export async function GET() {
  const token = await tokenOrNull();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const cms = await apiRequest("/v1/admin/storefront", {
      headers: { authorization: `Bearer ${token}` },
    });
    return NextResponse.json({ cms });
  } catch (error) {
    return respondError(error);
  }
}

export async function POST(request: Request) {
  const token = await tokenOrNull();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const body = await request.json();
    const entity = String(body.entity || "");
    const path = entity === "header"
      ? "/v1/admin/header-messages"
      : entity === "banner"
        ? "/v1/admin/banners"
        : "";
    if (!path) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    const result = await apiRequest(path, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: body.data ?? {},
    });
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return respondError(error);
  }
}

export async function PATCH(request: Request) {
  const token = await tokenOrNull();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const body = await request.json();
    const entity = String(body.entity || "");
    const id = String(body.id || "");
    let path = "";
    if (entity === "header" && id) path = `/v1/admin/header-messages/${encodeURIComponent(id)}`;
    if (entity === "banner" && id) path = `/v1/admin/banners/${encodeURIComponent(id)}`;
    if (entity === "section" && id) path = `/v1/admin/home-sections/${encodeURIComponent(id)}`;
    if (!path) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    const result = await apiRequest(path, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}` },
      body: body.data ?? {},
    });
    return NextResponse.json({ result });
  } catch (error) {
    return respondError(error);
  }
}

export async function DELETE(request: Request) {
  const token = await tokenOrNull();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const body = await request.json();
    const entity = String(body.entity || "");
    const id = String(body.id || "");
    const path = entity === "header"
      ? `/v1/admin/header-messages/${encodeURIComponent(id)}`
      : entity === "banner"
        ? `/v1/admin/banners/${encodeURIComponent(id)}`
        : "";
    if (!id || !path) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    const result = await apiRequest(path, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    return NextResponse.json({ result });
  } catch (error) {
    return respondError(error);
  }
}
