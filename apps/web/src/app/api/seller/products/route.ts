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
    { error: "SELLER_PRODUCT_REQUEST_FAILED", message: "عملیات محصول فروشنده انجام نشد." },
    { status: 500 },
  );
}

export async function GET() {
  const token = await tokenOrNull();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const [products, categories] = await Promise.all([
      apiRequest("/v1/manage/products", {
        headers: { authorization: `Bearer ${token}` },
      }),
      apiRequest("/v1/catalog/categories"),
    ]);
    return NextResponse.json({ products, categories });
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

    if (action === "media-upload-ticket" || action === "media-upload-complete") {
      const id = String(body.id || "");
      if (!id) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
      const suffix = action === "media-upload-ticket" ? "upload-ticket" : "complete";
      const result = await apiRequest(
        `/v1/products/${encodeURIComponent(id)}/media/${suffix}`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          body: body.data ?? {},
        },
      );
      return NextResponse.json({ result }, { status: 201 });
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
    } else if (action === "archive") {
      path += "/archive";
      payload = { archived: body.archived !== false };
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

export async function DELETE(request: Request) {
  const token = await tokenOrNull();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const body = await request.json();
    const productId = String(body.productId || "");
    const mediaId = String(body.mediaId || "");
    if (!productId || !mediaId) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }
    const result = await apiRequest(
      `/v1/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(mediaId)}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      },
    );
    return NextResponse.json({ result });
  } catch (error) {
    return respondError(error);
  }
}
