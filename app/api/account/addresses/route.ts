import { getCustomerUser } from "@/lib/customer-auth";
import {
  createCustomerAddress,
  deleteCustomerAddress,
  listCustomerAddresses,
  setDefaultCustomerAddress,
} from "@/db/customer-address-repository";
import { validateCustomerAddressPayload } from "@/features/account/address-validation";
import { rejectCrossSiteMutation } from "@/lib/request-security";
import { rejectRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const MAX_JSON_BYTES = 16_384;
const INVALID_JSON = Symbol("invalid-json");
const JSON_TOO_LARGE = Symbol("json-too-large");

export async function GET() {
  const user = await getCustomerUser();
  if (!user) return unauthorized();
  try {
    return privateJson(
      { addresses: await listCustomerAddresses(user.email) },
    );
  } catch {
    return unavailable();
  }
}

export async function POST(request: Request) {
  const user = await getCustomerUser();
  if (!user) return unauthorized();
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const rateLimited = await addressRateLimit(request, user.email);
  if (rateLimited) return rateLimited;
  const payload = await readBoundedJson(request);
  if (payload === JSON_TOO_LARGE) {
    return privateJson({ error: "حجم درخواست بیش از حد مجاز است." }, 413);
  }
  if (payload === INVALID_JSON) {
    return privateJson({ error: "درخواست معتبر نیست." }, 400);
  }
  const input = validateCustomerAddressPayload(payload);
  if (!input) {
    return privateJson({ error: "اطلاعات نشانی کامل یا معتبر نیست." }, 422);
  }
  try {
    const address = await createCustomerAddress(user.email, input);
    return privateJson({ address }, 201);
  } catch (error) {
    return error instanceof Error && error.message === "ADDRESS_LIMIT"
      ? privateJson({ error: "حداکثر ۱۰ نشانی قابل ثبت است." }, 409)
      : unavailable();
  }
}

export async function PATCH(request: Request) {
  const user = await getCustomerUser();
  if (!user) return unauthorized();
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const rateLimited = await addressRateLimit(request, user.email);
  if (rateLimited) return rateLimited;
  const payload = await readBoundedJson(request);
  if (payload === JSON_TOO_LARGE) {
    return privateJson({ error: "حجم درخواست بیش از حد مجاز است." }, 413);
  }
  if (payload === INVALID_JSON) {
    return privateJson({ error: "درخواست معتبر نیست." }, 400);
  }
  const id = objectText(payload, "id", 120);
  if (!id || !isUuid(id)) {
    return privateJson({ error: "شناسه نشانی معتبر نیست." }, 422);
  }
  try {
    await setDefaultCustomerAddress(user.email, id);
    return privateJson({ addresses: await listCustomerAddresses(user.email) });
  } catch (error) {
    return error instanceof Error && error.message === "ADDRESS_NOT_FOUND"
      ? privateJson({ error: "نشانی پیدا نشد." }, 404)
      : unavailable();
  }
}

export async function DELETE(request: Request) {
  const user = await getCustomerUser();
  if (!user) return unauthorized();
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const rateLimited = await addressRateLimit(request, user.email);
  if (rateLimited) return rateLimited;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!isUuid(id)) {
    return privateJson({ error: "شناسه نشانی معتبر نیست." }, 422);
  }
  try {
    await deleteCustomerAddress(user.email, id);
    return privateJson({ addresses: await listCustomerAddresses(user.email) });
  } catch (error) {
    return error instanceof Error && error.message === "ADDRESS_NOT_FOUND"
      ? privateJson({ error: "نشانی پیدا نشد." }, 404)
      : unavailable();
  }
}

function objectText(value: unknown, key: string, maxLength: number) {
  if (typeof value !== "object" || value === null) return "";
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "string" ? item.trim().slice(0, maxLength) : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function unauthorized() {
  return privateJson({ error: "برای مدیریت نشانی‌ها وارد حساب شوید." }, 401);
}

function addressRateLimit(request: Request, email: string) {
  return rejectRateLimited(request, {
    scope: "address.mutate",
    identity: email,
    limit: 60,
    windowSeconds: 3_600,
  });
}

function unavailable() {
  return privateJson({ error: "مدیریت نشانی‌ها موقتاً در دسترس نیست." }, 503);
}

async function readBoundedJson(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
    return JSON_TOO_LARGE;
  }
  const text = await request.text().catch(() => "");
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) {
    return JSON_TOO_LARGE;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return INVALID_JSON;
  }
}

function privateJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store, max-age=0",
      pragma: "no-cache",
    },
  });
}
