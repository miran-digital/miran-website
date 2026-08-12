import type { MetadataRoute } from "next";

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
  };
}
