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
    { error: "SELLER_PORTAL_FAILED", message: "عملیات فروشندگی انجام نشد." },
    { status: 500 },
  );
}

export async function GET() {
  const token = await tokenOrNull();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const seller = await apiRequest("/v1/sellers/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    return NextResponse.json({ seller });
  } catch (error) {
    return respondError(error);
  }
}

export async function POST(request: Request) {
  const token = await tokenOrNull();
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const body = await request.json();
    const action = String(body.action || "apply");
    let path = "/v1/sellers";
    let payload: Record<string, unknown> = {
      businessName: body.businessName,
      legalName: body.legalName,
      nationalId: body.nationalId,
    };
    if (action === "guarantee") {
      path = "/v1/sellers/guarantees";
      payload = {
        kind: body.kind,
        reference: body.reference,
        amountIrr: body.amountIrr,
      };
    }
    const result = await apiRequest(path, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: payload,
    });
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return respondError(error);
  }
}
