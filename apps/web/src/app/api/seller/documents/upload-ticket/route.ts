import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

export async function POST(request: Request) {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  try {
    const ticket = await apiRequest("/v1/sellers/documents/upload-ticket", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: await request.json(),
    });
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "UPLOAD_TICKET_FAILED", message: "ساخت مجوز آپلود امن انجام نشد." },
      { status: 500 },
    );
  }
}
