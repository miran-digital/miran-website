import type { AdminState } from "./admin-types";
import type { PublicStorefrontState } from "./public-storefront";

export {
  adminSectionLabels,
  createAdminId,
  createDefaultAdminState,
  delegableAdminPermissions,
  MAX_PRODUCT_IMAGES,
  getActiveHeaderMessage,
  getActiveHeaderMessages,
  getActiveBanners,
  isAmazingProductActive,
  normalizeAttributeCode,
  normalizeAdminHref,
  normalizeCurrencyCode,
  normalizeProductCategorySlug,
  normalizeSlug,
  stableBrandSlug,
  type AdminProduct,
  type AdminProductContentSection,
  type AdminProductDiscountType,
  type AdminProductPlacement,
  type AdminPermission,
  type AdminRole,
  type AdminUser,
  type AdminProductVariant,
  type AdminAttributeDataType,
  type AdminProductAttributeValue,
  type AdminVariantAttributeValue,
  type AdminSellerOffer,
  type AdminCategory,
  type AdminBrand,
  type AdminBranding,
  type AdminSectionKey,
  type AdminState,
} from "./admin-types";

export function loadPublicStorefrontState() {
  return requestPublicState("/api/storefront");
}

export function loadAdminState() {
  return requestState("/api/admin/state");
}

export async function saveAdminState(
  state: AdminState,
  options: { deleteCategoryId?: string } = {},
) {
  const response = await fetch("/api/admin/state", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state, ...options }),
  });
  const payload = (await response.json()) as {
    state?: AdminState;
    error?: string;
  };
  if (!response.ok || !payload.state) {
    if (response.status === 401) {
      throw new Error("نشست مدیریت منقضی شده است؛ دوباره وارد مدیریت شوید.");
    }
    throw new Error(payload.error || "ذخیره تغییرات ممکن نشد.");
  }
  return payload.state;
}

export async function removeAdminProduct(id: string) {
  const response = await fetch("/api/admin/products", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const payload = await response.json() as { mode?: "deleted" | "archived"; error?: string };
  if (!response.ok || !payload.mode) throw new Error(payload.error || "حذف محصول ممکن نشد.");
  return payload.mode;
}

export async function removeAdminProductVariant(productId: string, variantId: string) {
  const response = await fetch("/api/admin/product-variants", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productId, variantId }),
  });
  const payload = await response.json() as { deleted?: boolean; error?: string };
  if (!response.ok || payload.deleted !== true) {
    throw new Error(payload.error || "حذف تنوع ممکن نشد.");
  }
}

async function requestState(path: string) {
  const response = await fetch(path, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    state?: AdminState;
    error?: string;
  };
  if (!response.ok || !payload.state) {
    if (response.status === 401) {
      throw new Error("نشست مدیریت منقضی شده است؛ دوباره وارد مدیریت شوید.");
    }
    throw new Error(payload.error || "دریافت اطلاعات فروشگاه ممکن نشد.");
  }
  return payload.state;
}

async function requestPublicState(path: string) {
  const response = await fetch(path, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    state?: PublicStorefrontState;
    error?: string;
  };
  if (!response.ok || !payload.state) {
    throw new Error(payload.error || "دریافت اطلاعات فروشگاه ممکن نشد.");
  }
  return payload.state;
}
