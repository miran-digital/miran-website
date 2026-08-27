import { rejectRateLimited, requestIdentity } from "./rate-limit.ts";

export type CustomerAuthRateLimitedAction =
  | "signup"
  | "login"
  | "reset"
  | "session"
  | "exchange"
  | "verify"
  | "updatePassword"
  | "refresh"
  | "logout";

export async function rateLimitCustomerAuth(
  request: Request,
  action: CustomerAuthRateLimitedAction,
  email?: string,
  databaseOverride?: D1Database,
) {
  const policy = action === "login"
    ? { scope: "auth.login" as const, ipLimit: 30, accountLimit: 10, windowSeconds: 900 }
    : action === "signup"
      ? { scope: "auth.signup" as const, ipLimit: 10, accountLimit: 3, windowSeconds: 3_600 }
      : action === "reset" || action === "updatePassword"
        ? { scope: "auth.password-reset" as const, ipLimit: 10, accountLimit: 3, windowSeconds: 3_600 }
        : action === "refresh"
          ? { scope: "auth.refresh" as const, ipLimit: 30, accountLimit: 0, windowSeconds: 300 }
          : action === "session" || action === "exchange" || action === "verify"
            ? { scope: "auth.verification" as const, ipLimit: 30, accountLimit: 0, windowSeconds: 900 }
            : null;
  if (!policy) return null;
  const ipLimited = await rejectRateLimited(request, {
    scope: policy.scope,
    identity: `ip:${requestIdentity(request)}`,
    limit: policy.ipLimit,
    windowSeconds: policy.windowSeconds,
    failureMode: "closed",
  }, databaseOverride);
  if (ipLimited) return ipLimited;
  if (!email || policy.accountLimit === 0) return null;
  return rejectRateLimited(request, {
    scope: policy.scope,
    identity: `account:${email}`,
    limit: policy.accountLimit,
    windowSeconds: policy.windowSeconds,
    failureMode: "closed",
  }, databaseOverride);
}
