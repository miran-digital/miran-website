import { NextRequest, NextResponse } from "next/server";
import {
  clearCustomerSessionCookies,
  customerCookieNames,
  getSupabaseConfiguration,
  isCustomerAccessTokenExpired,
  setCustomerSessionCookies,
} from "@/lib/customer-auth";
import { refreshCustomerSession } from "@/lib/customer-auth-provider";
import { rejectRateLimited } from "@/lib/rate-limit";

export async function proxy(request: NextRequest) {
  const accessToken = request.cookies.get(customerCookieNames.access)?.value;
  const refreshToken = request.cookies.get(customerCookieNames.refresh)?.value;
  if (
    !refreshToken ||
    (accessToken && !isCustomerAccessTokenExpired(accessToken))
  ) {
    return NextResponse.next();
  }

  const limited = await rejectRateLimited(request, {
    scope: "auth.refresh",
    limit: 30,
    windowSeconds: 300,
    failureMode: "closed",
  });
  if (limited) return limited;

  const config = await getSupabaseConfiguration();
  if (!config) return unavailableResponse(60);

  const refreshed = await refreshCustomerSession(config, refreshToken);
  if (!refreshed.tokens) {
    console.error("customer_auth_refresh_rejected", {
      status: refreshed.result.status,
    });
    if (refreshed.result.status === 429) {
      return rateLimitedResponse(refreshed.result.retryAfterSeconds ?? 60);
    }
    if (refreshed.result.status >= 500) {
      return unavailableResponse(refreshed.result.retryAfterSeconds ?? 60);
    }
    const response = nextWithCustomerCookies(request, null);
    return clearCustomerSessionCookies(response);
  }

  const response = nextWithCustomerCookies(request, {
    accessToken: refreshed.tokens.accessToken,
    refreshToken: refreshed.tokens.refreshToken,
  });
  return setCustomerSessionCookies(response, refreshed.tokens);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|media/|admin(?:/|$)|api/admin(?:/|$)|api/auth(?:/|$)).*)",
  ],
};

function nextWithCustomerCookies(
  request: NextRequest,
  tokens: { accessToken: string; refreshToken: string } | null,
) {
  const headers = new Headers(request.headers);
  const excluded = new Set(Object.values(customerCookieNames));
  const pairs = request.cookies
    .getAll()
    .filter((cookie) => !excluded.has(cookie.name))
    .map((cookie) => `${cookie.name}=${cookie.value}`);
  if (tokens) {
    pairs.push(`${customerCookieNames.access}=${tokens.accessToken}`);
    pairs.push(`${customerCookieNames.refresh}=${tokens.refreshToken}`);
  }
  headers.set("cookie", pairs.join("; "));
  return NextResponse.next({ request: { headers } });
}

function rateLimitedResponse(retryAfterSeconds: number) {
  return Response.json(
    { error: "تعداد درخواست‌های ورود زیاد است؛ کمی بعد دوباره تلاش کنید." },
    {
      status: 429,
      headers: {
        "cache-control": "private, no-store",
        "retry-after": String(retryAfterSeconds),
      },
    },
  );
}

function unavailableResponse(retryAfterSeconds: number) {
  return Response.json(
    {
      error:
        "سامانهٔ ورود موقتاً در دسترس نیست؛ کمی بعد دوباره تلاش کنید.",
    },
    {
      status: 503,
      headers: {
        "cache-control": "private, no-store",
        "retry-after": String(retryAfterSeconds),
      },
    },
  );
}
