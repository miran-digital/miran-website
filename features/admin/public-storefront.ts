import { filterActiveHeaderMessages } from "../../lib/header-messages.ts";
import { navigationGroups } from "../navigation/navigation-data.ts";
import type {
  AdminAmazingSection,
  AdminBanner,
  AdminBrand,
  AdminBranding,
  AdminCategory,
  AdminHeaderMessage,
  AdminProduct,
  AdminSectionKey,
  AdminState,
} from "./admin-types.ts";

export type PublicHeaderMessage = Pick<
  AdminHeaderMessage,
  "id" | "text" | "href" | "backgroundColor" | "textColor"
>;

export type PublicBanner = Pick<
  AdminBanner,
  | "id"
  | "title"
  | "altText"
  | "href"
  | "desktopImageUrl"
  | "mobileImageUrl"
  | "placement"
  | "scope"
  | "categorySlug"
>;

export type PublicCategory = Omit<AdminCategory, "visible">;

export type PublicProduct = Pick<
  AdminProduct,
  | "id"
  | "title"
  | "slug"
  | "brand"
  | "category"
  | "placement"
  | "currency"
  | "priceMinor"
  | "compareAtPriceMinor"
  | "discountType"
  | "discountValue"
  | "imageUrls"
  | "amazingEnabled"
  | "amazingStartsAt"
  | "amazingEndsAt"
> & {
  availableQuantity: number;
};

export type PublicStorefrontState = {
  version: 1;
  sections: Record<AdminSectionKey, boolean>;
  visibleCategorySlugs: string[];
  categoryOrder: string[];
  categories: PublicCategory[];
  brands: AdminBrand[];
  branding: AdminBranding;
  headerMessages: PublicHeaderMessage[];
  banners: PublicBanner[];
  amazingSection: AdminAmazingSection;
  productRows: Array<{
    id: string;
    itemLimit: number;
    enabled: boolean;
  }>;
  products: PublicProduct[];
};

export function createUnavailablePublicStorefrontState(): PublicStorefrontState {
  return {
    version: 1,
    sections: {
      hero: false,
      categories: false,
      specialOffers: false,
      digitalPicks: false,
      homePicks: false,
      trending: false,
      brands: false,
      trust: false,
    },
    visibleCategorySlugs: [],
    categoryOrder: [],
    categories: [],
    brands: [],
    branding: {
      siteName: "MIRAN",
      logoUrl: "",
      logoAlt: "لوگوی MIRAN",
    },
    headerMessages: [],
    banners: [],
    amazingSection: {
      title: "",
      subtitle: "",
      href: "/offers",
      linkLabel: "",
      backgroundColor: "#ffffff",
      textColor: "#111827",
      selectionMode: "amazing",
      itemLimit: 0,
      endsAt: "",
      showTimer: false,
    },
    productRows: [],
    products: [],
  };
}

type PublicCategoryTaxonomy = readonly {
  slug: string;
  parentSlug?: string;
}[];

const navigationCategoryTaxonomy: PublicCategoryTaxonomy = navigationGroups.flatMap(
  (group) => {
    const parentSlug = group.href.replace("/category/", "");
    return [
      { slug: parentSlug },
      ...group.links.map((link) => ({
        slug: link.href.replace("/category/", ""),
        parentSlug,
      })),
    ];
  },
);

export function toPublicStorefrontState(
  state: AdminState,
  options: {
    now?: number;
    categoryTaxonomy?: PublicCategoryTaxonomy;
  } = {},
): PublicStorefrontState {
  const now = options.now ?? Date.now();
  const hiddenSlugs = new Set(state.hiddenCategoryIds);
  const staticCategories = options.categoryTaxonomy ?? navigationCategoryTaxonomy;
  const categoryParents = new Map(
    [
      ...staticCategories.map((category) => [category.slug, category.parentSlug ?? ""] as const),
      ...state.customCategories.map((category) => [category.slug, category.parentSlug] as const),
    ],
  );
  const inactiveSlugs = new Set(
    state.customCategories
      .filter((category) => !category.visible)
      .map((category) => category.slug),
  );
  const allCategorySlugs = new Set([
    ...staticCategories.map((category) => category.slug),
    ...state.customCategories.map((category) => category.slug),
  ]);
  const categoryVisibility = new Map<string, boolean>();
  const categoryIsVisible = (slug: string, trail = new Set<string>()): boolean => {
    const cached = categoryVisibility.get(slug);
    if (cached !== undefined) return cached;
    if (hiddenSlugs.has(slug) || inactiveSlugs.has(slug) || trail.has(slug)) {
      categoryVisibility.set(slug, false);
      return false;
    }
    const parentSlug = categoryParents.get(slug);
    const visible = !parentSlug || categoryIsVisible(parentSlug, new Set([...trail, slug]));
    categoryVisibility.set(slug, visible);
    return visible;
  };
  const visibleCategorySlugs = [...allCategorySlugs].filter((slug) => categoryIsVisible(slug));
  const visibleCategorySet = new Set(visibleCategorySlugs);
  const categories = state.customCategories
    .filter((category) => visibleCategorySet.has(category.slug))
    .map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      description: category.description,
      parentSlug: category.parentSlug,
      imageUrl: category.imageUrl,
      imageHidden: category.imageHidden,
      system: category.system,
    }));
  const productIsPublic = (product: AdminProduct) =>
    product.visible && categoryIsVisible(product.category);

  return {
    version: 1,
    sections: { ...state.sections },
    visibleCategorySlugs,
    categoryOrder: state.categoryOrder.filter((slug) => visibleCategorySet.has(slug)),
    categories,
    brands: state.brands.filter((brand) => categoryIsVisible(brand.categorySlug)),
    branding: { ...state.branding },
    headerMessages: filterActiveHeaderMessages(state.headerMessages, now).map(
      ({ id, text, href, backgroundColor, textColor }) => ({
        id,
        text,
        href,
        backgroundColor,
        textColor,
      }),
    ),
    banners: state.banners
      .filter((banner) =>
        banner.visible &&
        isActiveWindow(banner.startsAt, banner.endsAt, now) &&
        (banner.scope !== "category" || visibleCategorySet.has(banner.categorySlug)),
      )
      .map(({
        id,
        title,
        altText,
        href,
        desktopImageUrl,
        mobileImageUrl,
        placement,
        scope,
        categorySlug,
      }) => ({
        id,
        title,
        altText,
        href,
        desktopImageUrl,
        mobileImageUrl,
        placement,
        scope,
        categorySlug,
      })),
    amazingSection: { ...state.amazingSection },
    productRows: state.productRows.map(({ id, itemLimit, visible }) => ({
      id,
      itemLimit,
      enabled: visible,
    })),
    products: state.products.filter(productIsPublic).map((product) => ({
      id: product.id,
      title: product.title,
      slug: product.slug,
      brand: product.brand,
      category: product.category,
      placement: product.placement,
      currency: product.currency,
      priceMinor: product.priceMinor,
      compareAtPriceMinor: product.compareAtPriceMinor,
      discountType: product.discountType,
      discountValue: product.discountValue,
      imageUrls: [...product.imageUrls],
      amazingEnabled: product.amazingEnabled,
      amazingStartsAt: product.amazingStartsAt,
      amazingEndsAt: product.amazingEndsAt,
      availableQuantity: Math.max(0, product.stockQuantity - product.reservedQuantity),
    })),
  };
}

export function isPublicAmazingProductActive(
  product: Pick<PublicProduct, "amazingEnabled" | "amazingStartsAt" | "amazingEndsAt">,
  now = Date.now(),
) {
  return product.amazingEnabled && isActiveWindow(
    product.amazingStartsAt,
    product.amazingEndsAt,
    now,
    true,
  );
}

function isActiveWindow(
  startsAt: string,
  endsAt: string,
  now: number,
  requireBoth = false,
) {
  if (requireBoth && (!startsAt || !endsAt)) return false;
  const start = startsAt ? Date.parse(startsAt) : null;
  const end = endsAt ? Date.parse(endsAt) : null;
  if (
    (start !== null && Number.isNaN(start)) ||
    (end !== null && Number.isNaN(end))
  ) return false;
  return (start === null || start <= now) && (end === null || end >= now);
}
