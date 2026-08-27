const DEFAULT_SITE_URL = "https://almiran.ir";

export function getSiteUrl() {
  const configured = process.env.SITE_URL?.trim() || DEFAULT_SITE_URL;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Unsupported site URL protocol");
    }
    return new URL(url.origin);
  } catch {
    return new URL(DEFAULT_SITE_URL);
  }
}

export function absoluteSiteUrl(path = "/") {
  return new URL(path, getSiteUrl()).href;
}
