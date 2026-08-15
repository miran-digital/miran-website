export type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const baseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";
  const requestUrl = new URL(path, baseUrl);
  const expectedOrigin = new URL(baseUrl).origin;

  if (requestUrl.origin !== expectedOrigin) {
    throw new TypeError("API requests must stay on the configured API origin");
  }

  const { body, headers: initialHeaders, ...requestOptions } = options;
  const headers = new Headers(initialHeaders);
  if (!headers.has("accept")) headers.set("accept", "application/json");
  if (body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(requestUrl, {
    ...requestOptions,
    cache: requestOptions.cache ?? "no-store",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers,
  });

  const payload = await response.json().catch(() => null) as
    | { error?: string; message?: string }
    | T
    | null;

  if (!response.ok) {
    const errorPayload = payload as { error?: string; message?: string } | null;
    throw new ApiError(
      errorPayload?.message ?? `API request failed with status ${response.status}`,
      response.status,
      errorPayload?.error,
    );
  }

  return payload as T;
}
