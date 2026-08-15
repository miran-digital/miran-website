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
    { error: "SELLER_REQUEST_FAILED", message: "عملیات فروشنده انجام نشد." },
    { status: 500 },
  );
}

export async function GET() {
  const token = await tokenOrNull();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const sellers = await apiRequest("/v1/admin/sellers", {
      headers: { authorization: `Bearer ${token}` },
    });
    return NextResponse.json({ sellers });
  } catch (error) {
    return respondError(error);
  }
}

export async function PATCH(request: Request) {
  const token = await tokenOrNull();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const body = await request.json();
    const action = String(body.action || "");
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

    let path = "";
    let payload: Record<string, unknown> = {};
    if (action === "seller-review") {
      path = `/v1/admin/sellers/${encodeURIComponent(id)}/review`;
      payload = { status: body.status, reason: body.reason };
    } else if (action === "document-review") {
      path = `/v1/admin/seller-documents/${encodeURIComponent(id)}/review`;
      payload = { status: body.status };
    } else if (action === "guarantee-review") {
      path = `/v1/admin/seller-guarantees/${encodeURIComponent(id)}/review`;
      payload = { status: body.status };
    } else {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const result = await apiRequest(path, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}` },
      body: payload,
    });
    return NextResponse.json({ result });
  } catch (error) {
    return respondError(error);
  }
}
