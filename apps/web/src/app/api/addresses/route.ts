import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value;
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
    const addresses = await apiRequest("/v1/addresses", {
      headers: { authorization: `Bearer ${token}` },
    });
    return NextResponse.json({ addresses });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const address = await apiRequest("/v1/addresses", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: await request.json(),
    });
    return NextResponse.json({ address }, { status: 201 });
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
    const address = await apiRequest(`/v1/addresses/${encodeURIComponent(id)}/default`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}` },
    });
    return NextResponse.json({ address });
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
