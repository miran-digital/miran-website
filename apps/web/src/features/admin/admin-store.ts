export type AdminSectionKey =
  | "hero"
  | "categories"
  | "specialOffers"
  | "digitalPicks"
  | "homePicks"
  | "trending"
  | "brands"
  | "trust";

export type AdminHeaderMessage = {
  id: string;
  text: string;
  href: string;
  startsAt: string;
  endsAt: string;
  visible: boolean;
};

export type AdminBanner = {
  id: string;
  title: string;
  href: string;
  visible: boolean;
};

export type AdminProductRow = {
  id: string;
  title: string;
  itemLimit: number;
  visible: boolean;
};

export type AdminProduct = {
  id: string;
  title: string;
  slug: string;
  brand: string;
  category: string;
  priceMinor: number;
  imageDataUrl: string;
  visible: boolean;
};

export type AdminState = {
  version: 1;
  sections: Record<AdminSectionKey, boolean>;
  hiddenCategoryIds: string[];
  headerMessages: AdminHeaderMessage[];
  banners: AdminBanner[];
  productRows: AdminProductRow[];
  products: AdminProduct[];
};

const storageKey = "miran.admin-preview.v1";
const changeEvent = "miran:admin-preview-change";
const sectionKeys: readonly AdminSectionKey[] = [
  "hero",
  "categories",
  "specialOffers",
  "digitalPicks",
  "homePicks",
  "trending",
  "brands",
  "trust",
];

export const adminSectionLabels: Record<AdminSectionKey, string> = {
  hero: "Hero",
  categories: "دسته‌بندی‌های Home",
  specialOffers: "پیشنهادهای ویژه",
  digitalPicks: "منتخب دیجیتال",
  homePicks: "برای خانه",
  trending: "محبوب و پربازدید",
  brands: "برندها",
  trust: "اعتماد و خدمات",
};

export function createDefaultAdminState(): AdminState {
  return {
    version: 1,
    sections: {
      hero: true,
      categories: true,
      specialOffers: true,
      digitalPicks: true,
      homePicks: true,
      trending: true,
      brands: true,
      trust: true,
    },
    hiddenCategoryIds: [],
    headerMessages: [
      {
        id: "default-message",
        text: "ارسال سریع، خرید امن و پشتیبانی Miran Shop",
        href: "/help/delivery",
        startsAt: "",
        endsAt: "",
        visible: true,
      },
    ],
    banners: [],
    productRows: [
      {
        id: "digital-picks",
        title: "منتخب کالای دیجیتال",
        itemLimit: 4,
        visible: true,
      },
      { id: "home-picks", title: "برای خانه", itemLimit: 4, visible: true },
    ],
    products: [],
  };
}

function isAdminState(value: unknown): value is AdminState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Partial<AdminState>;
  return (
    state.version === 1 &&
    typeof state.sections === "object" &&
    state.sections !== null &&
    sectionKeys.every((key) => typeof state.sections?.[key] === "boolean") &&
    Array.isArray(state.hiddenCategoryIds) &&
    state.hiddenCategoryIds.every((id) => isShortString(id, 120)) &&
    Array.isArray(state.headerMessages) &&
    state.headerMessages.every(isHeaderMessage) &&
    Array.isArray(state.banners) &&
    state.banners.every(isBanner) &&
    Array.isArray(state.productRows) &&
    state.productRows.every(isProductRow) &&
    Array.isArray(state.products) &&
    state.products.every(isProduct)
  );
}

function isShortString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isHeaderMessage(value: unknown): value is AdminHeaderMessage {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    isShortString(item.id, 120) &&
    isShortString(item.text, 160) &&
    isShortString(item.href, 300) &&
    isShortString(item.startsAt, 40) &&
    isShortString(item.endsAt, 40) &&
    typeof item.visible === "boolean"
  );
}

function isBanner(value: unknown): value is AdminBanner {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    isShortString(item.id, 120) &&
    isShortString(item.title, 160) &&
    isShortString(item.href, 300) &&
    typeof item.visible === "boolean"
  );
}

function isProductRow(value: unknown): value is AdminProductRow {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    isShortString(item.id, 120) &&
    isShortString(item.title, 160) &&
    typeof item.itemLimit === "number" &&
    Number.isSafeInteger(item.itemLimit) &&
    item.itemLimit >= 1 &&
    item.itemLimit <= 24 &&
    typeof item.visible === "boolean"
  );
}

function isProduct(value: unknown): value is AdminProduct {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  const imageIsSafe =
    item.imageDataUrl === "" ||
    (isShortString(item.imageDataUrl, 1_400_000) &&
      /^data:image\/(?:avif|gif|jpeg|png|webp);base64,/.test(
        item.imageDataUrl,
      ));
  return (
    isShortString(item.id, 120) &&
    isShortString(item.title, 180) &&
    isShortString(item.slug, 180) &&
    isShortString(item.brand, 100) &&
    isShortString(item.category, 100) &&
    typeof item.priceMinor === "number" &&
    Number.isSafeInteger(item.priceMinor) &&
    item.priceMinor >= 0 &&
    imageIsSafe &&
    typeof item.visible === "boolean"
  );
}

export function getAdminState() {
  try {
    const value = window.localStorage.getItem(storageKey);
    if (!value) return createDefaultAdminState();
    const parsed: unknown = JSON.parse(value);
    if (!isAdminState(parsed)) return createDefaultAdminState();
    return {
      ...parsed,
      hiddenCategoryIds: [...new Set(parsed.hiddenCategoryIds)].slice(0, 100),
      headerMessages: parsed.headerMessages.slice(0, 10).map((message) => ({
        ...message,
        href: normalizeAdminHref(message.href),
      })),
      banners: parsed.banners.slice(0, 20).map((banner) => ({
        ...banner,
        href: normalizeAdminHref(banner.href),
      })),
      productRows: parsed.productRows.slice(0, 20),
      products: parsed.products.slice(0, 20),
    };
  } catch {
    return createDefaultAdminState();
  }
}

export function saveAdminState(state: AdminState) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Preview settings remain in memory if browser storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(changeEvent));
  return state;
}

export function subscribeToAdminState(listener: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key === storageKey) listener();
  }
  window.addEventListener(changeEvent, listener);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(changeEvent, listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function createAdminId(prefix: string) {
  return typeof crypto.randomUUID === "function"
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}`;
}

export function normalizeAdminHref(value: string) {
  const href = value.trim();
  return href.startsWith("/") && !href.startsWith("//")
    ? href.slice(0, 300)
    : "/";
}

export function getActiveHeaderMessage(state: AdminState) {
  const now = Date.now();
  return (
    state.headerMessages.find((message) => {
      if (!message.visible) return false;
      const startsAt = message.startsAt ? Date.parse(message.startsAt) : null;
      const endsAt = message.endsAt ? Date.parse(message.endsAt) : null;
      return (
        (startsAt === null || Number.isNaN(startsAt) || startsAt <= now) &&
        (endsAt === null || Number.isNaN(endsAt) || endsAt >= now)
      );
    }) ?? null
  );
}
