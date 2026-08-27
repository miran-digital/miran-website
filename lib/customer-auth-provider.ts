export type CustomerAuthProviderResult = {
  ok: boolean;
  status: number;
  data: unknown;
  retryAfterSeconds?: number;
};

export type CustomerAuthProviderConfiguration = {
  url: string;
  key: string;
};

export type CustomerAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export async function callCustomerAuthProvider(
  config: CustomerAuthProviderConfiguration,
  path: string,
  options: {
    body?: unknown;
    method?: string;
    accessToken?: string;
    redirectTo?: string;
  } = {},
  providerFetch: typeof fetch = fetch,
): Promise<CustomerAuthProviderResult> {
  const url = new URL(`${config.url}${path}`);
  if (options.redirectTo) url.searchParams.set("redirect_to", options.redirectTo);
  const response = await providerFetch(url, {
    method: options.method ?? "POST",
    headers: {
      apikey: config.key,
      "Content-Type": "application/json",
      ...(options.accessToken
        ? { Authorization: `Bearer ${options.accessToken}` }
        : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  }).catch(() => null);
  if (!response) return { ok: false, status: 503, data: {} };
  const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
  return {
    ok: response.ok,
    status: response.status,
    data: await response.json().catch(() => ({})),
    ...(Number.isFinite(retryAfter) && retryAfter > 0
      ? { retryAfterSeconds: retryAfter }
      : {}),
  };
}

export async function refreshCustomerSession(
  config: CustomerAuthProviderConfiguration,
  refreshToken: string,
  providerFetch: typeof fetch = fetch,
) {
  const result = await callCustomerAuthProvider(
    config,
    "/auth/v1/token?grant_type=refresh_token",
    { body: { refresh_token: refreshToken } },
    providerFetch,
  );
  if (!result.ok) return { result, tokens: null };
  const data = result.data as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
  };
  if (
    typeof data.access_token !== "string" ||
    typeof data.refresh_token !== "string"
  ) {
    return {
      result: { ...result, ok: false, status: 502 },
      tokens: null,
    };
  }
  return {
    result,
    tokens: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: typeof data.expires_in === "number"
        ? Math.max(60, Math.min(86_400, Math.floor(data.expires_in)))
        : 3_600,
    } satisfies CustomerAuthTokens,
  };
}

export function getSupabaseSignupOutcome(
  result: CustomerAuthProviderResult,
): "accepted" | "existing" | "rejected" {
  if (!result.ok) return "rejected";
  const data = result.data as { user?: { identities?: unknown[] } };
  return data.user &&
    Array.isArray(data.user.identities) &&
    data.user.identities.length === 0
    ? "existing"
    : "accepted";
}
