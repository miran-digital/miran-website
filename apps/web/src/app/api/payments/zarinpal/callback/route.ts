import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const authority = url.searchParams.get("Authority") || url.searchParams.get("authority") || "";
  const status = url.searchParams.get("Status") || url.searchParams.get("status") || "";
  const accountUrl = new URL("/account", url.origin);

  if (!authority) {
    accountUrl.searchParams.set("payment", "invalid-callback");
    return NextResponse.redirect(accountUrl);
  }

  try {
    const result = await apiRequest<{
      orderId: string;
      referenceId?: string | null;
      cancelled?: boolean;
      alreadyVerified?: boolean;
    }>("/v1/payments/zarinpal/verify", {
      method: "POST",
      body: { authority, status },
    });
    accountUrl.searchParams.set("order", result.orderId);
    accountUrl.searchParams.set(
      "payment",
      result.cancelled ? "cancelled" : "success",
    );
    if (result.referenceId) accountUrl.searchParams.set("ref", result.referenceId);
    return NextResponse.redirect(accountUrl);
  } catch (error) {
    accountUrl.searchParams.set("payment", "verification-failed");
    if (error instanceof ApiError && error.code) {
      accountUrl.searchParams.set("code", error.code);
    }
    return NextResponse.redirect(accountUrl);
  }
}
