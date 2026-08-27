import {
  consumeRateLimit,
  type RateLimitScope,
} from "../db/rate-limit-repository.ts";

export async function rejectRateLimited(
  request: Request,
  input: {
    scope: RateLimitScope;
    identity?: string;
    limit: number;
    windowSeconds: number;
    failureMode?: "open" | "closed";
  },
  databaseOverride?: D1Database,
) {
  const identity = input.identity || requestIdentity(request);
  try {
    const result = await consumeRateLimit({ ...input, identity }, databaseOverride);
    if (result.allowed) return null;
    return Response.json(
      { error: "تعداد درخواست‌ها بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید." },
      {
        status: 429,
        headers: {
          "cache-control": "private, no-store",
          "retry-after": String(result.retryAfterSeconds),
          "x-ratelimit-remaining": "0",
        },
      },
    );
  } catch {
    console.error("rate_limit_storage_unavailable", { scope: input.scope });
    if (input.failureMode === "closed") {
      return Response.json(
        {
          error:
            "سامانهٔ امنیتی ورود موقتاً در دسترس نیست؛ کمی بعد دوباره تلاش کنید.",
        },
        {
          status: 503,
          headers: {
            "cache-control": "private, no-store",
            "retry-after": "60",
          },
        },
      );
    }
    return null;
  }
}

export function requestIdentity(request: Request) {
  return request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    `anonymous:${request.headers.get("user-agent") ?? "unknown"}`;
}
