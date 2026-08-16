import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

type RouteContext = { params: Promise<{ id: string }> };

type DownloadTicket = {
  downloadUrl: string;
  expiresAt: string;
};

export async function GET(_request: Request, context: RouteContext) {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  try {
    const ticket = await apiRequest<DownloadTicket>(
      `/v1/admin/seller-documents/${encodeURIComponent(id)}/download-ticket`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    return NextResponse.redirect(ticket.downloadUrl);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "DOCUMENT_DOWNLOAD_FAILED", message: "دریافت امن مدرک انجام نشد." },
      { status: 500 },
    );
  }
}
