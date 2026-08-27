const PRODUCT_SLUG_ALIASES: Readonly<Record<string, string>> = {
  "jelayer-mint-250": "jellayer-mint-250",
};

export function resolveProductSlug(slug: string) {
  return PRODUCT_SLUG_ALIASES[slug] ?? slug;
}

export function productHref(slug: string) {
  return `/product/${encodeURIComponent(resolveProductSlug(slug))}`;
}
