import type { MetadataRoute } from "next";
import { absoluteSiteUrl, getSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const indexable = process.env.SITE_INDEXABLE === "true";
  return {
    rules: indexable
      ? {
          userAgent: "*",
          allow: "/",
          disallow: [
            "/account",
            "/admin",
            "/cart",
            "/checkout",
            "/search",
            "/wishlist",
          ],
        }
      : { userAgent: "*", disallow: "/" },
    sitemap: absoluteSiteUrl("/sitemap.xml"),
    host: getSiteUrl().origin,
  };
}
