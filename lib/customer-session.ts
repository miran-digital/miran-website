export const customerCookieNames = {
  access: "miran_customer_access",
  refresh: "miran_customer_refresh",
  pkce: "miran_customer_pkce",
};

export const customerCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};

type CookieResponse = {
  cookies: {
    set: (
      name: string,
      value: string,
      options: typeof customerCookieOptions & { maxAge: number },
    ) => unknown;
  };
};

export function setCustomerSessionCookies(
  response: CookieResponse,
  tokens: { accessToken: string; refreshToken: string; expiresIn?: number },
) {
  response.cookies.set(customerCookieNames.access, tokens.accessToken, {
    ...customerCookieOptions,
    maxAge: tokens.expiresIn ?? 3_600,
  });
  response.cookies.set(customerCookieNames.refresh, tokens.refreshToken, {
    ...customerCookieOptions,
    maxAge: 2_592_000,
  });
  response.cookies.set(customerCookieNames.pkce, "", {
    ...customerCookieOptions,
    maxAge: 0,
  });
  return response;
}

export function clearCustomerSessionCookies(response: CookieResponse) {
  for (const name of Object.values(customerCookieNames)) {
    response.cookies.set(name, "", { ...customerCookieOptions, maxAge: 0 });
  }
  return response;
}

export function isCustomerAccessTokenExpired(token: string, now = Date.now()) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return true;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(
      atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")),
    ) as { exp?: unknown };
    return typeof decoded.exp !== "number" || decoded.exp * 1_000 <= now;
  } catch {
    return true;
  }
}
