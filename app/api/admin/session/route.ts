import { NextResponse } from "next/server";
import {
  authenticateOwnerCredential,
  createOwnerSession,
} from "@/db/admin-owner-auth-repository";
import { readAdminEmail } from "@/lib/admin-auth";
import {
  adminOwnerSessionCookie,
  adminOwnerSessionCookieOptions,
} from "@/lib/admin-owner-session";
import { rejectRateLimited } from "@/lib/rate-limit";
import { rejectCrossSiteMutation } from "@/lib/request-security";
import {
  isInvalidJson,
  isJsonTooLarge,
  objectText,
  privateJson,
  readBoundedJson,
} from "@/lib/request-json";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const payload = await readBoundedJson(request, 4_096);
  if (isJsonTooLarge(payload)) return privateJson({ error: "حجم درخواست بیش از حد مجاز است." }, 413);
  if (isInvalidJson(payload)) return privateJson({ error: "درخواست معتبر نیست." }, 400);
  const username = objectText(payload, "username", 40).toLowerCase();
  const password = objectText(payload, "password", 128);
  if (!username || !password) return privateJson({ error: "نام کاربری و رمز را وارد کنید." }, 422);

  const limited = await rejectRateLimited(request, {
    scope: "admin.login",
    identity: `${request.headers.get("cf-connecting-ip") ?? "unknown"}:${username}`,
    limit: 8,
    windowSeconds: 15 * 60,
  });
  if (limited) return limited;
  const ipLimited = await rejectRateLimited(request, {
    scope: "admin.login",
    identity: `ip:${request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? "unknown"}`,
    limit: 20,
    windowSeconds: 60 * 60,
  });
  if (ipLimited) return ipLimited;

  try {
    const authenticated = await authenticateOwnerCredential(username, password);
    const configuredOwnerEmail = await readAdminEmail();
    if (!authenticated || !configuredOwnerEmail || authenticated.ownerEmail !== configuredOwnerEmail) {
      return privateJson({ error: "نام کاربری یا رمز مالک نادرست است." }, 401);
    }
    const session = await createOwnerSession(configuredOwnerEmail);
    const response = NextResponse.json({ ok: true });
    response.headers.set("cache-control", "private, no-store");
    response.cookies.set(adminOwnerSessionCookie, session.token, {
      ...adminOwnerSessionCookieOptions,
      maxAge: session.maxAge,
    });
    return response;
  } catch {
    return privateJson({ error: "ورود مالک موقتاً ممکن نیست." }, 503);
  }
}
