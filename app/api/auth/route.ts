import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  clearCustomerSessionCookies,
  customerCookieNames,
  customerCookieOptions,
  getSupabaseConfiguration,
  setCustomerSessionCookies,
} from "@/lib/customer-auth";
import { customerPasswordError } from "@/lib/customer-password";
import { rejectCrossSiteMutation } from "@/lib/request-security";
import { upsertCustomerAccount } from "@/db/customer-account-repository";
import {
  callCustomerAuthProvider,
  getSupabaseSignupOutcome,
  refreshCustomerSession,
  type CustomerAuthProviderResult,
} from "@/lib/customer-auth-provider";
import { rateLimitCustomerAuth } from "@/lib/customer-auth-rate-limit";

type AuthPayload = {
  action?: "signup" | "login" | "reset" | "session" | "exchange" | "verify" | "updatePassword" | "refresh" | "logout";
  email?: string;
  password?: string;
  fullName?: string;
  accessToken?: string;
  refreshToken?: string;
  code?: string;
  tokenHash?: string;
  verificationType?: string;
};

const verificationTypes = new Set(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

export async function POST(request: NextRequest) {
  const rejected = rejectCrossSiteMutation(request);
  if (rejected) return rejected;
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 20_000) return fail("حجم درخواست بیش از حد مجاز است.", 413);
  const payload = await request.json().catch(() => null) as AuthPayload | null;
  if (!payload?.action) return fail("درخواست نامعتبر است.", 400);
  const normalizedEmail = payload.email?.trim().toLowerCase();
  const limited = await rateLimitCustomerAuth(
    request,
    payload.action,
    normalizedEmail && /^\S+@\S+\.\S+$/.test(normalizedEmail)
      ? normalizedEmail
      : undefined,
  );
  if (limited) return limited;
  const config = await getSupabaseConfiguration();
  if (payload.action === "logout") {
    const accessToken = (await cookies()).get(customerCookieNames.access)?.value;
    if (config && accessToken) {
      await callCustomerAuthProvider(config, "/auth/v1/logout", {
        method: "POST",
        accessToken,
      });
    }
    return clearSession(json({ ok: true }));
  }
  if (!config) {
    return fail(
      "سامانهٔ ورود موقتاً در دسترس نیست؛ کمی بعد دوباره تلاش کنید.",
      503,
      60,
    );
  }
  if (payload.action === "refresh") {
    const refreshToken = (await cookies()).get(customerCookieNames.refresh)?.value;
    if (!refreshToken) {
      return clearSession(fail("نشست ورود منقضی شده است؛ دوباره وارد شوید.", 401));
    }
    const refreshed = await refreshCustomerSession(config, refreshToken);
    if (refreshed.tokens) {
      await recordCustomerAccount(refreshed.result.data);
      return sessionResponse(
        refreshed.tokens.accessToken,
        refreshed.tokens.refreshToken,
        refreshed.tokens.expiresIn,
      );
    }
    logProviderFailure("refresh", refreshed.result);
    const failure = authFail(
      refreshed.result,
      "نشست ورود منقضی شده است؛ دوباره وارد شوید.",
    );
    return refreshed.result.status >= 500 || refreshed.result.status === 429
      ? failure
      : clearSession(failure);
  }
  if (payload.action === "session") {
    if (!payload.accessToken || !payload.refreshToken) return fail("اطلاعات نشست ناقص است.", 400);
    const verified = await callCustomerAuthProvider(config, "/auth/v1/user", { method: "GET", accessToken: payload.accessToken });
    if (!verified.ok) return fail("پیوند ورود معتبر نیست یا منقضی شده است.", 401);
    await recordCustomerAccount({ user: verified.data });
    return sessionResponse(payload.accessToken, payload.refreshToken);
  }
  if (payload.action === "exchange") {
    const code = payload.code?.trim();
    const verifier = (await cookies()).get(customerCookieNames.pkce)?.value;
    if (!code || code.length > 2_048 || !verifier) return fail("پیوند تأیید معتبر نیست یا در مرورگر دیگری باز شده است.", 400);
    const result = await callCustomerAuthProvider(config, "/auth/v1/token?grant_type=pkce", {
      body: { auth_code: code, code_verifier: verifier },
    });
    if (!result.ok) return authFail(result, "پیوند تأیید معتبر نیست یا منقضی شده است.");
    return await tokenSessionResponse(result, "پیوند تأیید معتبر نیست یا منقضی شده است.");
  }
  if (payload.action === "verify") {
    const tokenHash = payload.tokenHash?.trim();
    const verificationType = payload.verificationType?.trim();
    if (!tokenHash || tokenHash.length > 2_048 || !verificationType || !verificationTypes.has(verificationType)) {
      return fail("پیوند تأیید معتبر نیست یا منقضی شده است.", 400);
    }
    const result = await callCustomerAuthProvider(config, "/auth/v1/verify", {
      body: { token_hash: tokenHash, type: verificationType },
    });
    if (!result.ok) return authFail(result, "پیوند تأیید معتبر نیست یا منقضی شده است.");
    return await tokenSessionResponse(result, "پیوند تأیید معتبر نیست یا منقضی شده است.");
  }
  if (payload.action === "updatePassword") {
    const passwordError = customerPasswordError(payload.password);
    if (passwordError) return fail(passwordError, 400);
    const accessToken = (await cookies()).get(customerCookieNames.access)?.value;
    if (!accessToken) return fail("نشست بازیابی منقضی شده است؛ دوباره درخواست بازیابی بدهید.", 401);
    const result = await callCustomerAuthProvider(config, "/auth/v1/user", {
      method: "PUT",
      accessToken,
      body: { password: payload.password },
    });
    if (!result.ok) return authFail(result, "تغییر رمز انجام نشد؛ دوباره پیوند بازیابی بگیرید.");
    await callCustomerAuthProvider(config, "/auth/v1/logout", { method: "POST", accessToken });
    return clearSession(json({
      ok: true,
      message: "رمز عبور تغییر کرد. اکنون با رمز جدید وارد شوید.",
    }));
  }
  const email = normalizedEmail;
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return fail("ایمیل معتبر وارد کنید.", 400);
  if (payload.action === "reset") {
    const result = await callCustomerAuthProvider(config, "/auth/v1/recover", {
      body: { email },
      redirectTo: "https://almiran.ir/auth/callback",
    });
    if (!result.ok) {
      logProviderFailure("reset", result);
      return authFail(
        result,
        "ارسال پیوند بازیابی انجام نشد؛ چند دقیقه دیگر دوباره تلاش کنید.",
      );
    }
    return json({ ok: true, message: "اگر این ایمیل ثبت شده باشد، پیوند بازیابی برای آن ارسال می‌شود." });
  }
  const passwordError = customerPasswordError(payload.password);
  if (passwordError) return fail(passwordError, 400);
  if (payload.action === "signup") {
    const { verifier, challenge } = await createPkce();
    const result = await callCustomerAuthProvider(config, "/auth/v1/signup", {
      body: {
        email,
        password: payload.password,
        data: { full_name: payload.fullName?.trim().slice(0, 100) || undefined },
        code_challenge: challenge,
        code_challenge_method: "s256",
      },
      redirectTo: "https://almiran.ir/auth/callback",
    });
    const signupOutcome = getSupabaseSignupOutcome(result);
    if (signupOutcome === "rejected") {
      logProviderFailure("signup", result);
      return authFail(result);
    }
    if (signupOutcome === "existing") {
      return fail(
        "این ایمیل قبلاً ثبت شده است؛ وارد شوید یا رمز عبور را بازیابی کنید.",
        409,
      );
    }
    await recordCustomerAccount(result.data);
    const response = json({
      ok: true,
      message:
        "درخواست ارسال ایمیل تأیید با موفقیت پذیرفته شد. ایمیل را باز کنید و روی پیوند بزنید؛ مستقیم وارد حساب می‌شوید.",
    });
    response.cookies.set(customerCookieNames.pkce, verifier, { ...customerCookieOptions, maxAge: 1_200 });
    return response;
  }
  if (payload.action === "login") {
    const result = await callCustomerAuthProvider(config, "/auth/v1/token?grant_type=password", { body: { email, password: payload.password } });
    if (!result.ok) {
      logProviderFailure("login", result);
      return authFail(result);
    }
    const data = result.data as { access_token?: string; refresh_token?: string };
    if (!data.access_token || !data.refresh_token) return fail("ورود کامل نشد.", 502);
    await recordCustomerAccount(result.data);
    return sessionResponse(data.access_token, data.refresh_token);
  }
  return fail("درخواست نامعتبر است.", 400);
}

function sessionResponse(access: string, refresh: string, expiresIn = 3_600) {
  const response = json({ ok: true });
  return setCustomerSessionCookies(response, {
    accessToken: access,
    refreshToken: refresh,
    expiresIn,
  });
}
function clearSession(response: NextResponse) {
  return clearCustomerSessionCookies(response);
}
function authFail(result: CustomerAuthProviderResult, fallback = "عملیات ورود انجام نشد. اطلاعات را بررسی کنید.") {
  const data = result.data as { msg?: string; message?: string; error_description?: string };
  const raw = `${data.msg ?? data.message ?? data.error_description ?? ""}`.toLowerCase();
  const message = raw.includes("invalid login") ? "ایمیل یا رمز عبور نادرست است، یا ایمیل هنوز تأیید نشده است." : raw.includes("already") ? "این ایمیل قبلاً ثبت شده است؛ وارد شوید یا رمز را بازیابی کنید." : raw.includes("rate") ? "تعداد درخواست‌ها زیاد است؛ چند دقیقه بعد دوباره امتحان کنید." : fallback;
  if (result.status === 429) {
    return fail(
      "تعداد درخواست‌های ورود زیاد است؛ کمی بعد دوباره تلاش کنید.",
      429,
      result.retryAfterSeconds ?? 60,
    );
  }
  if (result.status >= 500) {
    return fail(
      "سامانهٔ ورود موقتاً در دسترس نیست؛ کمی بعد دوباره تلاش کنید.",
      503,
      result.retryAfterSeconds ?? 60,
    );
  }
  if (result.status === 401) return fail(message, 401);
  return fail(message, 400);
}

function logProviderFailure(
  action: "signup" | "login" | "reset" | "refresh",
  result: { status: number; data: unknown },
) {
  const data = result.data as { code?: unknown; error_code?: unknown };
  const rawCode = data?.code ?? data?.error_code;
  const code = typeof rawCode === "string"
    ? rawCode.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80)
    : "unknown";
  console.error("customer_auth_provider_rejected", {
    action,
    status: result.status,
    code,
  });
}
function json(body: object, init?: number) {
  const response = NextResponse.json(body, init ? { status: init } : undefined);
  response.headers.set("cache-control", "private, no-store");
  return response;
}
function fail(error: string, status: number, retryAfterSeconds?: number) {
  const response = json({ ok: false, error }, status);
  if (retryAfterSeconds) {
    response.headers.set("retry-after", String(retryAfterSeconds));
  }
  return response;
}

async function tokenSessionResponse(result: { data: unknown }, fallback: string) {
  const data = result.data as { access_token?: string; refresh_token?: string };
  if (!data.access_token || !data.refresh_token) return fail(fallback, 401);
  await recordCustomerAccount(result.data);
  return sessionResponse(data.access_token, data.refresh_token);
}

async function recordCustomerAccount(value: unknown) {
  const payload = value as {
    user?: {
      id?: unknown;
      email?: unknown;
      email_confirmed_at?: unknown;
      created_at?: unknown;
      user_metadata?: { full_name?: unknown; name?: unknown };
    };
  };
  const user = payload?.user;
  if (!user || typeof user.id !== "string" || typeof user.email !== "string") return;
  const rawName = user.user_metadata?.full_name ?? user.user_metadata?.name;
  await upsertCustomerAccount({
    authUserId: user.id,
    email: user.email,
    fullName: typeof rawName === "string" ? rawName : "",
    emailConfirmedAt: typeof user.email_confirmed_at === "string" ? user.email_confirmed_at : "",
    createdAt: typeof user.created_at === "string" ? user.created_at : "",
  }).catch(() => undefined);
}

async function createPkce() {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64Url(random);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

function base64Url(value: Uint8Array) {
  return btoa(String.fromCharCode(...value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
