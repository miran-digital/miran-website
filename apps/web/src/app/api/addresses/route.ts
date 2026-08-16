import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value;
}

function normalizeAddress(value: unknown) {
  const item = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    id: String(item.id || ""),
    label: String(item.label || "نشانی"),
    full_name: String(item.full_name ?? item.fullName ?? ""),
    phone: String(item.phone || ""),
    province: String(item.province || ""),
    city: String(item.city || ""),
    address_line: String(item.address_line ?? item.addressLine ?? ""),
    postal_code: String(item.postal_code ?? item.postalCode ?? ""),
    is_default: Number(Boolean(item.is_default ?? item.isDefault)),
  };
}

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: "ADDRESS_REQUEST_FAILED", message: "عملیات نشانی انجام نشد." },
    { status: 500 },
  );
}

export async function GET() {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const result = await apiRequest<unknown[]>("/v1/addresses", {
      headers: { authorization: `Bearer ${token}` },
    });
    const addresses = Array.isArray(result) ? result.map(normalizeAddress) : [];
    return NextResponse.json({ addresses });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const result = await apiRequest("/v1/addresses", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: await request.json(),
    });
    return NextResponse.json({ address: normalizeAddress(result) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const body = await request.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    const result = await apiRequest(`/v1/addresses/${encodeURIComponent(id)}/default`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}` },
    });
    return NextResponse.json({ address: normalizeAddress(result) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!id) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    const result = await apiRequest(`/v1/addresses/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
