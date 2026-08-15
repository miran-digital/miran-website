import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
import {
  issueBannerUploadTicket,
  MediaStorageError,
  publicMediaUrl,
  verifyPublicMediaObject,
} from "@/lib/storage/public-media-storage";

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
  if (error instanceof MediaStorageError) {
    const status = error.code === "STORAGE_NOT_CONFIGURED"
      ? 503
      : error.code === "STORAGE_OBJECT_MISMATCH"
        ? 409
        : 500;
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status },
    );
  }
  return NextResponse.json(
    { error: "STOREFRONT_CMS_FAILED", message: "عملیات محتوای فروشگاه انجام نشد." },
    { status: 500 },
  );
}

async function requireManagedBanner(token: string, id: string) {
  const cms = await apiRequest<{ banners: Array<{ id: string }> }>("/v1/admin/storefront", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!cms.banners.some((banner) => banner.id === id)) {
    throw new ApiError(404, "NOT_FOUND", "Banner not found");
  }
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

    if (entity === "banner-media-upload-ticket") {
      const id = String(body.id || "");
      if (!id) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
      await requireManagedBanner(token, id);
      const ticket = issueBannerUploadTicket(id, {
        mimeType: String(body.data?.mimeType || ""),
        sizeBytes: Number(body.data?.sizeBytes),
        sha256: String(body.data?.sha256 || ""),
      });
      return NextResponse.json({ result: ticket }, { status: 201 });
    }

    if (entity === "banner-media-upload-complete") {
      const id = String(body.id || "");
      const storageKey = String(body.data?.storageKey || "");
      const mimeType = String(body.data?.mimeType || "").toLowerCase();
      const sizeBytes = Number(body.data?.sizeBytes);
      const sha256 = String(body.data?.sha256 || "").toLowerCase();
      if (!id || !storageKey.startsWith(`public/banners/${encodeURIComponent(id)}/`)) {
        return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
      }
      await requireManagedBanner(token, id);
      await verifyPublicMediaObject({ storageKey, mimeType, sizeBytes, sha256 });
      const result = await apiRequest(`/v1/admin/banners/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}` },
        body: { imageUrl: publicMediaUrl(storageKey) },
      });
      return NextResponse.json({ result });
    }

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
