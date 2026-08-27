import {
  getOwnerCredentialStatus,
  ownerPasswordError,
  ownerUsernameError,
  saveOwnerCredential,
} from "@/db/admin-owner-auth-repository";
import { getAdminAccess } from "@/lib/admin-auth";
import { rejectCrossSiteMutation } from "@/lib/request-security";
import {
  isInvalidJson,
  isJsonTooLarge,
  objectText,
  privateJson,
  readBoundedJson,
} from "@/lib/request-json";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAdminAccess();
  if (!access.allowed || access.role !== "owner") return denied(access.allowed ? "forbidden" : access.reason);
  try {
    return privateJson({
      ...(await getOwnerCredentialStatus()),
      authMethod: access.authMethod,
    });
  } catch {
    return privateJson({ error: "خواندن تنظیمات ورود مالک ممکن نشد." }, 503);
  }
}

export async function PUT(request: Request) {
  const access = await getAdminAccess();
  if (!access.allowed || access.role !== "owner") return denied(access.allowed ? "forbidden" : access.reason);
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const payload = await readBoundedJson(request, 4_096);
  if (isJsonTooLarge(payload)) return privateJson({ error: "حجم درخواست بیش از حد مجاز است." }, 413);
  if (isInvalidJson(payload)) return privateJson({ error: "درخواست معتبر نیست." }, 400);
  const username = objectText(payload, "username", 40).toLowerCase();
  const password = objectText(payload, "password", 128);
  const currentPassword = objectText(payload, "currentPassword", 128);
  const usernameError = ownerUsernameError(username);
  const passwordError = ownerPasswordError(password, username);
  if (usernameError || passwordError) {
    return privateJson({ error: usernameError || passwordError }, 422);
  }
  try {
    const saved = await saveOwnerCredential({
      username,
      password,
      currentPassword,
      requireCurrentPassword: access.authMethod === "owner_password",
      ownerEmail: access.user.email,
      actorEmail: access.user.email,
    });
    return privateJson({
      ...saved,
      reauthenticationRequired: access.authMethod === "owner_password",
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "OWNER_CURRENT_PASSWORD_INVALID") {
      return privateJson({ error: "رمز فعلی مالک نادرست است." }, 401);
    }
    if (code === "OWNER_USERNAME_INVALID" || code === "OWNER_PASSWORD_INVALID") {
      return privateJson({ error: "نام کاربری یا رمز با قواعد امنیتی سازگار نیست." }, 422);
    }
    if (/UNIQUE/i.test(code)) return privateJson({ error: "این نام کاربری قابل استفاده نیست." }, 409);
    console.error("OWNER_CREDENTIAL_SAVE_FAILED", code.slice(0, 240));
    return privateJson({ error: "ذخیره ورود مستقل مالک ممکن نشد." }, 503);
  }
}

function denied(reason: "anonymous" | "forbidden" | "misconfigured") {
  return privateJson({ error: "فقط مالک اجازه تغییر ورود مستقل را دارد." }, reason === "anonymous" ? 401 : 403);
}
