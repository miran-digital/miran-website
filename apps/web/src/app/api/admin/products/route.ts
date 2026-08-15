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
    { error: "PRODUCT_REQUEST_FAILED", message: "عملیات محصول انجام نشد." },
    { status: 500 },
  );
}

export async function GET() {
  const token = await tokenOrNull();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const products = await apiRequest("/v1/manage/products", {
      headers: { authorization: `Bearer ${token}` },
    });
    return NextResponse.json({ products });
  } catch (error) {
    return respondError(error);
  }
}

export async function POST(request: Request) {
  const token = await tokenOrNull();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const body = await request.json();
    const action = String(body.action || "create");
    if (action === "media") {
      const id = String(body.id || "");
      if (!id) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
      const media = await apiRequest(`/v1/products/${encodeURIComponent(id)}/media`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: {
          mediaType: body.mediaType,
          url: body.url,
          sortOrder: body.sortOrder,
          isPrimary: body.isPrimary,
        },
      });
      return NextResponse.json({ media }, { status: 201 });
    }

    const product = await apiRequest("/v1/products", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body,
    });
    return NextResponse.json({ product }, { status: 201 });
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
    const action = String(body.action || "update");
    if (!id) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

    let path = `/v1/products/${encodeURIComponent(id)}`;
    let payload = body.data ?? {};
    if (action === "publish") {
      path += "/publish";
      payload = { published: Boolean(body.published) };
    } else if (action === "inventory") {
      path += "/inventory";
      payload = { stockOnHand: body.stockOnHand };
    }

    const product = await apiRequest(path, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}` },
      body: payload,
    });
    return NextResponse.json({ product });
  } catch (error) {
    return respondError(error);
  }
}
