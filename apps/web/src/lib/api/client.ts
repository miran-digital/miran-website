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

function getApiBaseUrl(): URL {
  const configuredBaseUrl = process.env.API_BASE_URL?.trim();

  if (!configuredBaseUrl) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("API_BASE_URL is required in production");
    }

    return new URL("http://localhost:3001");
  }

  const parsedBaseUrl = new URL(configuredBaseUrl);
  if (parsedBaseUrl.protocol !== "http:" && parsedBaseUrl.protocol !== "https:") {
    throw new TypeError("API_BASE_URL must use http or https");
  }

  if (parsedBaseUrl.username || parsedBaseUrl.password) {
    throw new TypeError("API_BASE_URL must not contain credentials");
  }

  return parsedBaseUrl;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const requestUrl = new URL(path, baseUrl);

  if (requestUrl.origin !== baseUrl.origin) {
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
