const INVALID_JSON = Symbol("invalid-json");
const JSON_TOO_LARGE = Symbol("json-too-large");

export async function readBoundedJson(request: Request, maxBytes = 16_384) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return JSON_TOO_LARGE;
  }
  const body = await request.text().catch(() => "");
  if (new TextEncoder().encode(body).byteLength > maxBytes) {
    return JSON_TOO_LARGE;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return INVALID_JSON;
  }
}

export function isInvalidJson(value: unknown): boolean {
  return value === INVALID_JSON;
}

export function isJsonTooLarge(value: unknown): boolean {
  return value === JSON_TOO_LARGE;
}

export function objectText(value: unknown, key: string, maxLength: number) {
  if (typeof value !== "object" || value === null) return "";
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "string" ? item.trim().slice(0, maxLength) : "";
}

export function objectNumber(value: unknown, key: string) {
  if (typeof value !== "object" || value === null) return Number.NaN;
  return Number((value as Record<string, unknown>)[key]);
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function privateJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store, max-age=0",
      pragma: "no-cache",
    },
  });
}
