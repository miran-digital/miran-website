import {
  countCategoryAttributeDefinitions,
  readStorefrontState,
  writeStorefrontState,
} from "@/db/admin-repository";
import {
  hasUniqueCatalogIdentifiers,
  isAdminState,
  normalizeSlug,
  type AdminState,
} from "@/features/admin/admin-types";
import { getAdminCatalogCategories } from "@/features/catalog/catalog-data";
import { getAdminAccess, hasAdminPermission } from "@/lib/admin-auth";
import {
  DUPLICATE_SIBLING_CATEGORY_MESSAGE,
  inspectCategoryReferences,
  introducesSiblingCategoryNameConflict,
} from "@/lib/category-integrity";
import { rejectCrossSiteMutation } from "@/lib/request-security";
import {
  collectManagedMediaUrls,
  deleteUnreferencedManagedMedia,
} from "@/lib/admin-media-cleanup";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAdminAccess("state.read");
  if (!access.allowed) return accessDenied(access.reason);

  try {
    return Response.json(
      { state: await readStorefrontState() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "خواندن پایگاه‌داده ممکن نشد." },
      { status: 503 },
    );
  }
}

export async function PUT(request: Request) {
  const access = await getAdminAccess("state.read");
  if (!access.allowed) return accessDenied(access.reason);
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }
  const state =
    typeof payload === "object" && payload !== null
      ? (payload as { state?: unknown }).state
      : null;
  const deleteCategoryId =
    typeof payload === "object" &&
    payload !== null &&
    "deleteCategoryId" in payload &&
    typeof (payload as { deleteCategoryId?: unknown }).deleteCategoryId === "string"
      ? (payload as { deleteCategoryId: string }).deleteCategoryId
      : "";
  if (
    typeof payload === "object" &&
    payload !== null &&
    "deleteCategoryId" in payload &&
    !deleteCategoryId
  ) {
    return Response.json({ error: "درخواست حذف دسته معتبر نیست." }, { status: 422 });
  }
  if (!isAdminState(state)) {
    return Response.json(
      { error: "ساختار اطلاعات مدیریت معتبر نیست." },
      { status: 422 },
    );
  }
  if (!hasUniqueCatalogIdentifiers(state)) {
    return Response.json(
      { error: "شناسه، نامک یا SKU تکراری در کاتالوگ وجود دارد." },
      { status: 422 },
    );
  }
  if (!hasValidManagedCategoryIdentifiers(state)) {
    return Response.json(
      { error: "شناسه یا نامک تکراری در دسته‌بندی‌ها وجود دارد." },
      { status: 422 },
    );
  }

  if (
    !hasAdminPermission(access, "content.write") &&
    !hasAdminPermission(access, "catalog.write") &&
    !hasAdminPermission(access, "security.write")
  ) {
    return accessDenied("forbidden");
  }

  try {
    const current = await readStorefrontState();
    if (
      introducesSiblingCategoryNameConflict(
        managedCategoryNames(current),
        managedCategoryNames(state),
      )
    ) {
      return Response.json(
        { error: DUPLICATE_SIBLING_CATEGORY_MESSAGE, field: "name" },
        { status: 422 },
      );
    }
    const removedProduct = current.products.some(
      (item) => !state.products.some((candidate) => candidate.id === item.id),
    );
    const removedCategory = deleteCategoryId
      ? current.customCategories.find((category) => category.id === deleteCategoryId)
      : undefined;
    if (
      deleteCategoryId &&
      (!removedCategory ||
        state.customCategories.some((category) => category.id === deleteCategoryId))
    ) {
      return Response.json(
        { error: "دستهٔ انتخاب‌شده برای حذف پیدا نشد." },
        { status: 409 },
      );
    }
    const removedBrand = current.brands.some(
      (item) => !state.brands.some((candidate) => candidate.id === item.id),
    );
    const removedBanner = current.banners.some(
      (item) => !state.banners.some((candidate) => candidate.id === item.id),
    );
    const removedMessage = current.headerMessages.some(
      (item) => !state.headerMessages.some((candidate) => candidate.id === item.id),
    );
    if (
      ((removedProduct || removedCategory || removedBrand) && !hasAdminPermission(access, "catalog.delete")) ||
      ((removedBanner || removedMessage) && !hasAdminPermission(access, "content.delete"))
    ) {
      return Response.json(
        { error: "این مدیر مجوز حذف این اطلاعات را ندارد." },
        { status: 403 },
      );
    }
    const categoryReferences = {
      products: current.products,
      categories: [...getAdminCatalogCategories(), ...current.customCategories],
      brands: current.brands,
      banners: current.banners,
    };
    if (
      removedCategory &&
      (removedCategory.system ||
        inspectCategoryReferences(categoryReferences, removedCategory.slug)
          .hasBusinessReferences ||
        (await countCategoryAttributeDefinitions(removedCategory.slug)) > 0)
    ) {
      return Response.json(
        {
          error:
            "برای حذف این دسته ابتدا محصولات، زیردسته‌ها، برندها و بنرهای وابسته را جابه‌جا یا حذف کنید.",
        },
        { status: 409 },
      );
    }
    if (
      !hasAdminPermission(access, "admins.write") &&
      JSON.stringify(current.adminUsers) !== JSON.stringify(state.adminUsers)
    ) {
      return Response.json(
        { error: "فقط مالک می‌تواند مدیران و سطح دسترسی آن‌ها را تغییر دهد." },
        { status: 403 },
      );
    }
    const nextState = hasAdminPermission(access, "admins.write")
      ? state
      : {
          ...current,
          ...(hasAdminPermission(access, "content.write")
            ? {
                sections: state.sections,
                branding: state.branding,
                headerMessages: state.headerMessages,
                banners: state.banners,
                amazingSection: state.amazingSection,
                productRows: state.productRows,
              }
            : {}),
          ...(hasAdminPermission(access, "catalog.write")
            ? {
                hiddenCategoryIds: state.hiddenCategoryIds,
                categoryOrder: state.categoryOrder,
                customCategories: state.customCategories,
                brands: state.brands,
                products: state.products,
              }
            : {}),
          ...(hasAdminPermission(access, "security.write")
            ? { commerce: state.commerce }
            : {}),
          adminUsers: current.adminUsers,
        };
    const saved = await writeStorefrontState(
      nextState,
      access.user.email,
      undefined,
      {
        allowCategoryDeletionIds: removedCategory
          ? [removedCategory.id]
          : [],
        systemCategoriesForNameValidation: getAdminCatalogCategories().map(
          (category) => ({
            id: `system-${category.slug}`,
            slug: category.slug,
            name: category.name,
            parentSlug: category.parentSlug ?? "",
          }),
        ),
      },
    );
    await deleteUnreferencedManagedMedia(
      collectManagedMediaUrls(current),
      collectManagedMediaUrls(saved),
    );
    return Response.json(
      { state: saved },
      {
        headers: {
          "cache-control": "no-store, max-age=0",
          "cloudflare-cdn-cache-control": "no-store",
          pragma: "no-cache",
        },
      },
    );
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "";
    if (errorCode === "DUPLICATE_SIBLING_CATEGORY_NAME") {
      return Response.json(
        { error: DUPLICATE_SIBLING_CATEGORY_MESSAGE, field: "name" },
        { status: 422 },
      );
    }
    const message = /SELLER_NOT_ELIGIBLE/.test(errorCode)
      ? "فقط فروشنده‌ای که مدارک، ضمانت و قراردادش کامل و تأیید شده باشد قابل فعال‌سازی است."
      : /UNIQUE|constraint/i.test(errorCode)
        ? "نامک محصول تکراری است."
        : "ذخیره تغییرات در پایگاه‌داده ممکن نشد.";
    return Response.json({ error: message }, { status: 409 });
  }
}

function managedCategoryNames(state: AdminState) {
  const system = getAdminCatalogCategories().map((category) => {
    const override = state.customCategories.find(
      (item) => item.system && item.slug === category.slug,
    );
    return override ?? {
      id: `system-${category.slug}`,
      name: category.name,
      parentSlug: category.parentSlug ?? "",
    };
  });
  return [
    ...system,
    ...state.customCategories.filter((category) => !category.system),
  ].map(({ id, name, parentSlug }) => ({ id, name, parentSlug }));
}

function hasValidManagedCategoryIdentifiers(state: AdminState) {
  const systemSlugs = new Set(
    getAdminCatalogCategories().map((category) => category.slug),
  );
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (const category of state.customCategories) {
    const slug = normalizeSlug(category.slug);
    if (
      !category.id ||
      !slug ||
      slug !== category.slug ||
      ids.has(category.id) ||
      slugs.has(slug) ||
      (category.system ? !systemSlugs.has(slug) : systemSlugs.has(slug))
    ) return false;
    ids.add(category.id);
    slugs.add(slug);
  }
  return true;
}

function accessDenied(reason: "anonymous" | "forbidden" | "misconfigured") {
  return Response.json(
    {
      error:
        reason === "misconfigured"
          ? "حساب مدیر هنوز در تنظیمات میزبانی ثبت نشده است."
          : "دسترسی مدیریت مجاز نیست.",
    },
    { status: reason === "anonymous" ? 401 : 403 },
  );
}
