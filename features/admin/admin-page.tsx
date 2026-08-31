"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Container } from "@/components/ui";
import type { CatalogCategory } from "@/features/catalog/catalog-gateway";
import {
  getAdminBankTransferReceipts,
  getAdminOrders,
  removeAdminOrder,
  reviewAdminBankTransferReceipt,
  updateAdminOrderStatus,
} from "@/features/orders/admin-orders";
import {
  type BankTransferReceipt,
  deliveryLabels,
  orderStatusLabels,
  paymentStatusLabels,
  type OrderStatus,
  type StoreOrder,
} from "@/features/orders/order-types";
import {
  getSellerApplications,
  removeSellerApplication,
  updateSellerApplicationStatus,
  type SellerApplication,
} from "@/features/seller/seller-applications";
import {
  canApproveSeller,
  sellerAgreementStatusLabels,
  sellerDocumentStatusLabels,
  sellerGuaranteeStatusLabels,
  sellerGuaranteeTypeLabels,
  sellerLegalTypeLabels,
  sellerStatusLabels,
  type SellerAdminUpdate,
} from "@/features/seller/seller-types";
import {
  adminSectionLabels,
  createAdminId,
  createDefaultAdminState,
  delegableAdminPermissions,
  loadAdminState,
  MAX_PRODUCT_IMAGES,
  normalizeAttributeCode,
  normalizeAdminHref,
  normalizeSlug,
  stableBrandSlug,
  removeAdminProduct,
  removeAdminProductVariant,
  saveAdminState,
  type AdminCategory,
  type AdminAttributeDataType,
  type AdminBrand,
  type AdminProductDiscountType,
  type AdminProductPlacement,
  type AdminProduct,
  type AdminPermission,
  type AdminRole,
  type AdminSectionKey,
  type AdminState,
} from "./admin-store";
import {
  getAdminRevisions,
  restoreAdminRevision,
  type AdminRevision,
} from "./admin-revisions";
import { getAdminReadiness } from "./admin-readiness";
import type { LaunchReadinessReport } from "@/lib/launch-readiness";
import {
  formatMoney,
  formatRialReference,
  IRAN_CURRENCY,
  normalizeLegacyPriceToRial,
  priceInputToRial,
  rialToPriceInput,
} from "@/lib/money";
import {
  calendarDatePlaceholder,
  calendarDateTimeToIso,
  formatCalendarDateTime,
  isoToCalendarInput,
  jalaliTimePlaceholder,
  type CalendarMode,
} from "@/lib/jalali";
import { calculateProductDiscount } from "@/lib/product-discount";
import {
  isValidIranianCardNumber,
  normalizeCardNumber,
} from "@/lib/bank-transfer";
import styles from "./admin.module.css";
import { CustomerCarePanel } from "./customer-care-panel";
import { CustomerDirectoryPanel } from "./customer-directory-panel";
import { OwnerCredentialSettings } from "./owner-credential-settings";
import { AdminReportsPanel } from "./admin-reports-panel";
import { PaymentGatewaySettings } from "./payment-gateway-settings";
import {
  getProductImageValidationError,
  optimizeProductImageForWeb,
  productImageFileIdentity,
  PRODUCT_IMAGE_ACCEPT,
} from "./product-image-optimizer";

type AdminTab = "overview" | "content" | "categories" | "banners" | "products" | "orders" | "customers" | "reports" | "sellers";
type SaveStatus = "idle" | "loading" | "saved" | "saving" | "error";
type StagedProductImage = { key: string; file: File; previewUrl: string };
type StagedProductVideo = { file: File; previewUrl: string };
const VARIANT_DELETE_CONFIRMATION =
  "فقط همین تنوع حذف می‌شود. خود محصول، تصاویر، ویدیو، قیمت اصلی و سایر تنوع‌ها باقی می‌مانند. ادامه می‌دهید؟";
const PRODUCT_VALIDATION_MESSAGE = "لطفاً فیلد مشخص‌شده را بررسی و اصلاح کنید.";
const SECURE_LOGIN_MESSAGE = "ورود امن فعال است؛ اطلاعات در پایگاه‌داده ذخیره می‌شود.";
const SAVE_SUCCESS_MESSAGE = "اطلاعات با موفقیت در پایگاه‌داده ذخیره شد.";
const PRODUCT_FIELD_VALIDATION_MESSAGES: Record<string, string> = {
  title: "عنوان فارسی هنوز وارد نشده است.",
  slug: "نامک انگلیسی وارد نشده یا قالب آن صحیح نیست.",
  sku: "کد کالا (SKU) هنوز وارد نشده است.",
  category: "دسته‌بندی محصول انتخاب نشده است.",
  brand: "برند محصول انتخاب نشده است.",
  basePrice: "قیمت پایه وارد نشده یا معتبر نیست.",
  discountValue: "مقدار تخفیف واردشده معتبر نیست.",
  stockQuantity: "موجودی کل وارد نشده یا کمتر از مقدار رزروشده است.",
};
const nextOrderStatuses: Record<OrderStatus, readonly OrderStatus[]> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["packing", "cancelled"],
  packing: ["shipped", "cancelled"],
  shipped: [],
  cancelled: [],
  expired: [],
};

const adminRoleLabels: Record<AdminRole, string> = {
  owner: "مالک اصلی",
  catalog_manager: "مدیر محصولات و دسته‌ها",
  content_manager: "مدیر محتوا و بنرها",
  order_manager: "مدیر سفارش‌ها",
  seller_manager: "مدیر فروشندگان",
};

const adminPermissionLabels: Record<(typeof delegableAdminPermissions)[number], string> = {
  "catalog.write": "محصولات و دسته‌ها",
  "catalog.delete": "حذف محصول و دسته",
  "content.write": "محتوا، پیام‌ها و بنرها",
  "content.delete": "حذف پیام و بنر",
  "orders.write": "سفارش‌ها و فیش‌ها",
  "orders.delete": "حذف کامل سفارش‌ها",
  "sellers.write": "فروشندگان",
  "sellers.delete": "حذف فروشندگان و مدارک",
  "customers.read": "مشاهده ایمیل مشتریان",
  "customers.delete": "پاک‌سازی اطلاعات مشتریان",
  "support.write": "پشتیبانی مشتریان",
  "support.delete": "حذف تیکت‌ها",
  "reviews.write": "دیدگاه‌ها",
  "reviews.delete": "حذف دیدگاه‌ها",
  "reports.read": "گزارش‌های فروش",
  "security.write": "تنظیمات حساس و پرداخت",
  "backup.read": "دریافت نسخه پشتیبان",
  "restore.write": "بازگردانی نسخه‌ها",
};

type CalendarInputValue = ReturnType<typeof isoToCalendarInput>;

function CalendarDateTimeInput({
  label,
  dateName,
  timeName,
  value,
  mode,
}: {
  label: string;
  dateName: string;
  timeName: string;
  value: CalendarInputValue;
  mode: CalendarMode;
}) {
  return (
    <>
      <label>
        تاریخ {label} {mode === "jalali" ? "شمسی" : "میلادی"}
        <input
          name={dateName}
          inputMode="numeric"
          autoComplete="off"
          dir="ltr"
          placeholder={calendarDatePlaceholder(mode)}
          defaultValue={value.date}
        />
      </label>
      <label>
        ساعت {label} ایران
        <input
          name={timeName}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          dir="ltr"
          placeholder={jalaliTimePlaceholder()}
          defaultValue={value.time}
        />
      </label>
    </>
  );
}

function AttributeValueInput({
  name,
  dataType,
  defaultValue = "",
}: {
  name: string;
  dataType: AdminAttributeDataType;
  defaultValue?: string;
}) {
  if (dataType === "boolean") {
    return (
      <select name={name} defaultValue={defaultValue || "true"}>
        <option value="true">بله</option>
        <option value="false">خیر</option>
      </select>
    );
  }
  return (
    <input
      name={name}
      type={dataType === "number" ? "number" : "text"}
      step={dataType === "number" ? "any" : undefined}
      maxLength={dataType === "text" ? 500 : undefined}
      defaultValue={defaultValue}
    />
  );
}

function optionalCalendarDateTime(
  data: FormData,
  dateName: string,
  timeName: string,
  mode: CalendarMode,
) {
  const date = String(data.get(dateName) ?? "").trim();
  const time = String(data.get(timeName) ?? "").trim();
  if (!date && !time) return { iso: "", valid: true };
  const iso = calendarDateTimeToIso(date, time, mode);
  return { iso, valid: Boolean(iso) };
}

function focusProductControl(form: HTMLFormElement, fieldName?: string) {
  const selector = fieldName ? `[name="${CSS.escape(fieldName)}"]` : ":invalid";
  const control = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector);
  if (!control) return fieldName ?? "";
  control.setAttribute("aria-invalid", "true");
  requestAnimationFrame(() => {
    control.focus({ preventScroll: true });
    control.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  });
  return control.name;
}

function productErrorField(message: string) {
  if (message.includes("نامک")) return "slug";
  if (message.includes("SKU") || message.includes("کد کالا")) return "sku";
  if (message.includes("درصد تخفیف") || message.includes("مبلغ")) return "discountValue";
  if (message.includes("شگفت‌انگیز")) return "amazingStartsDate";
  if (message.includes("تنوع")) return "newVariantTitle";
  if (message.includes("تصویر")) return "productImages";
  if (message.includes("موجودی") || message.includes("رزرو")) return "stockQuantity";
  if (message.includes("برند")) return "brand";
  if (message.includes("دسته")) return "category";
  return undefined;
}

class ProductValidationError extends Error {
  fieldName?: string;

  constructor(message: string, fieldName = productErrorField(message)) {
    super(message);
    this.name = "ProductValidationError";
    this.fieldName = fieldName;
  }
}

export function AdminPage({
  categories,
  signOutHref,
  role,
  permissions,
}: {
  categories: readonly CatalogCategory[];
  signOutHref: string;
  role: AdminRole;
  permissions: readonly AdminPermission[];
}) {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [state, setState] = useState<AdminState>(createDefaultAdminState);
  const [saveStatus, setSaveStatusState] = useState<SaveStatus>("loading");
  const [statusMessage, setStatusMessageState] = useState("");
  const saveStatusRef = useRef<SaveStatus>("loading");
  const statusMessageRef = useRef("");
  const setSaveStatus = useCallback((nextStatus: SaveStatus) => {
    saveStatusRef.current = nextStatus;
    setSaveStatusState(nextStatus);
  }, []);
  const setStatusMessage = useCallback((nextMessage: string) => {
    statusMessageRef.current = nextMessage;
    setStatusMessageState(nextMessage);
  }, []);
  const [activeProductValidation, setActiveProductValidation] = useState<{
    fieldName: string;
    message: string;
  } | null>(null);
  const [sellers, setSellers] = useState<SellerApplication[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState("");
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [bankTransferReceipts, setBankTransferReceipts] = useState<BankTransferReceipt[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [receiptReviewNote, setReceiptReviewNote] = useState("");
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const [editingProductId, setEditingProductId] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [newCategoryParentSlug, setNewCategoryParentSlug] = useState("");
  const [editingBrandId, setEditingBrandId] = useState("");
  const [newBrandCategorySlug, setNewBrandCategorySlug] = useState("");
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editingBannerId, setEditingBannerId] = useState("");
  const [selectedProductImages, setSelectedProductImages] = useState<StagedProductImage[]>([]);
  const [selectedProductVideo, setSelectedProductVideo] = useState<StagedProductVideo | null>(null);
  const [removedProductImages, setRemovedProductImages] = useState<string[]>([]);
  const [primaryProductImage, setPrimaryProductImage] = useState("");
  const [removeExistingProductVideo, setRemoveExistingProductVideo] = useState(false);
  const [productCategorySelection, setProductCategorySelection] = useState("");
  const [productBrandSelection, setProductBrandSelection] = useState("");
  const productPreviewUrls = useRef(new Set<string>());
  const productVariantsRef = useRef<HTMLFieldSetElement>(null);
  const [productMediaInputVersion, setProductMediaInputVersion] = useState(0);
  const [productEditorVersion, setProductEditorVersion] = useState(0);
  const [productBusy, setProductBusy] = useState(false);
  const [brandingBusy, setBrandingBusy] = useState(false);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [productCategoryFilter, setProductCategoryFilter] = useState("");
  const [sellerBusy, setSellerBusy] = useState(false);
  const [lastSavedProductSlug, setLastSavedProductSlug] = useState("");
  const [revisions, setRevisions] = useState<AdminRevision[]>([]);
  const [readiness, setReadiness] = useState<LaunchReadinessReport | null>(null);
  const [readinessError, setReadinessError] = useState("");
  const calendarMode = state.commerce.calendarMode;
  const can = (permission: AdminPermission) => permissions.includes(permission);
  const eligibleSellers = sellers.filter(
    (seller) => seller.status === "approved" && canApproveSeller(seller),
  );
  const lowStockEntries = state.products.flatMap((product) => {
    if (!product.visible) return [];
    const entries = [{
      id: product.id,
      label: product.title,
      available: product.stockQuantity - product.reservedQuantity,
    }];
    entries.push(...product.variants.filter((variant) => variant.visible).map((variant) => ({
      id: `${product.id}:variant:${variant.id}`,
      label: `${product.title} — ${variant.title}`,
      available: variant.stockQuantity - variant.reservedQuantity,
    })));
    entries.push(...product.sellerOffers.filter((offer) => offer.visible).map((offer) => ({
      id: `${product.id}:seller:${offer.id}`,
      label: `${product.title} — فروشنده ${offer.sellerName}`,
      available: offer.stockQuantity - offer.reservedQuantity,
    })));
    return entries.filter((entry) => entry.available <= state.commerce.lowStockThreshold);
  });

  useEffect(() => {
    let active = true;
    Promise.all([
      loadAdminState(),
      permissions.includes("sellers.write") ? getSellerApplications() : Promise.resolve([]),
      permissions.includes("orders.write") ? getAdminOrders() : Promise.resolve([]),
      permissions.includes("orders.write") ? getAdminBankTransferReceipts() : Promise.resolve([]),
    ])
      .then(([nextState, applications, loadedOrders, loadedReceipts]) => {
        if (!active) return;
        setState(nextState);
        setSellers(applications);
        setOrders(loadedOrders);
        setBankTransferReceipts(loadedReceipts);
        setStatusMessage(SECURE_LOGIN_MESSAGE);
        setSaveStatus("saved");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSaveStatus("error");
        setStatusMessage(
          error instanceof Error ? error.message : "بارگذاری پنل ممکن نشد.",
        );
      });
    return () => {
      active = false;
    };
  }, [permissions, setSaveStatus, setStatusMessage]);

  useEffect(() => {
    if (saveStatus !== "saved") return;
    const scheduledMessage = statusMessage;
    const timeoutMs = scheduledMessage === SECURE_LOGIN_MESSAGE ? 4_000 : 3_500;
    const timeoutId = window.setTimeout(() => {
      if (
        saveStatusRef.current !== "saved" ||
        statusMessageRef.current !== scheduledMessage
      ) return;
      setStatusMessage("");
      setSaveStatus("idle");
    }, timeoutMs);
    return () => window.clearTimeout(timeoutId);
  }, [saveStatus, setSaveStatus, setStatusMessage, statusMessage]);

  useEffect(() => () => {
    for (const url of productPreviewUrls.current) URL.revokeObjectURL(url);
    productPreviewUrls.current.clear();
  }, []);

  useEffect(() => {
    if (!permissions.includes("backup.read")) return;
    void getAdminRevisions().then(setRevisions).catch(() => setRevisions([]));
  }, [permissions]);

  useEffect(() => {
    if (!permissions.includes("security.write")) return;
    void getAdminReadiness()
      .then((report) => {
        setReadiness(report);
        setReadinessError("");
      })
      .catch((error: unknown) => {
        setReadinessError(
          error instanceof Error
            ? error.message
            : "بررسی آمادگی فروشگاه ممکن نشد.",
        );
      });
  }, [permissions, state, sellers, orders]);

  const selectedSeller = useMemo(
    () =>
      sellers.find((seller) => seller.id === selectedSellerId) ?? sellers[0],
    [selectedSellerId, sellers],
  );
  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? orders[0],
    [orders, selectedOrderId],
  );
  const selectedOrderReceipt = useMemo(
    () => bankTransferReceipts.find((receipt) => receipt.orderId === selectedOrder?.id),
    [bankTransferReceipts, selectedOrder?.id],
  );
  const editingProduct = state.products.find(
    (product) => product.id === editingProductId,
  );
  const editingProductAmazingStarts = isoToCalendarInput(
    editingProduct?.amazingStartsAt ?? "",
    calendarMode,
  );
  const editingProductAmazingEnds = isoToCalendarInput(
    editingProduct?.amazingEndsAt ?? "",
    calendarMode,
  );
  const persistedEditingCategory = state.customCategories.find(
    (category) => category.id === editingCategoryId,
  );
  const editingMessage = state.headerMessages.find(
    (message) => message.id === editingMessageId,
  );
  const editingMessageStarts = isoToCalendarInput(editingMessage?.startsAt ?? "", calendarMode);
  const editingMessageEnds = isoToCalendarInput(editingMessage?.endsAt ?? "", calendarMode);
  const editingBanner = state.banners.find(
    (banner) => banner.id === editingBannerId,
  );
  const editingBannerStarts = isoToCalendarInput(editingBanner?.startsAt ?? "", calendarMode);
  const editingBannerEnds = isoToCalendarInput(editingBanner?.endsAt ?? "", calendarMode);
  const amazingSectionEnds = isoToCalendarInput(state.amazingSection.endsAt, calendarMode);
  const systemCategories = categories.filter((category) => !category.custom);
  const managedSystemCategories: AdminCategory[] = systemCategories.map((category) => {
    const override = state.customCategories.find(
      (item) => item.system && item.slug === category.slug,
    );
    return override ?? {
      id: `system-${category.slug}`,
      slug: category.slug,
      name: category.name,
      description: category.description,
      parentSlug: category.parentSlug ?? "",
      imageUrl: "",
      imageHidden: false,
      system: true,
      visible: !state.hiddenCategoryIds.includes(category.slug),
    };
  });
  const editingCategory =
    persistedEditingCategory ??
    managedSystemCategories.find((category) => category.id === editingCategoryId);
  const editingBrand = state.brands.find((brand) => brand.id === editingBrandId);
  const allManagedCategories = [
    ...managedSystemCategories,
    ...state.customCategories.filter((category) => !category.system),
  ];
  const availableCategories: CatalogCategory[] = allManagedCategories.map(
    (category) => ({
        slug: category.slug,
        name: category.name,
        description: category.description,
        ...(category.parentSlug ? { parentSlug: category.parentSlug } : {}),
        custom: !category.system,
      }),
  );
  const selectableCategories = availableCategories.filter((category) => {
    if (state.hiddenCategoryIds.includes(category.slug)) return false;
    if (
      category.parentSlug &&
      state.hiddenCategoryIds.includes(category.parentSlug)
    ) return false;
    const custom = state.customCategories.find(
      (item) => item.slug === category.slug,
    );
    if (custom && !custom.visible) return false;
    return !allManagedCategories.some(
      (child) => child.parentSlug === category.slug && child.visible,
    );
  });
  const categoryRank = new Map(
    state.categoryOrder.map((slug, index) => [slug, index]),
  );
  const orderedRootCategories = allManagedCategories
    .filter((category) => !category.parentSlug)
    .sort(
      (left, right) =>
        (categoryRank.get(left.slug) ?? 999) -
        (categoryRank.get(right.slug) ?? 999),
    );

  function categoryPathLabel(slug: string) {
    const labels: string[] = [];
    const visited = new Set<string>();
    let current = allManagedCategories.find((category) => category.slug === slug);
    while (current && !visited.has(current.slug)) {
      labels.unshift(current.name);
      visited.add(current.slug);
      current = current.parentSlug
        ? allManagedCategories.find((category) => category.slug === current?.parentSlug)
        : undefined;
    }
    return labels.join(" ← ") || slug;
  }

  function isCategoryWithin(categorySlug: string, ancestorSlug: string) {
    const visited = new Set<string>();
    let cursor = categorySlug;
    while (cursor && !visited.has(cursor)) {
      if (cursor === ancestorSlug) return true;
      visited.add(cursor);
      cursor = allManagedCategories.find((category) => category.slug === cursor)?.parentSlug ?? "";
    }
    return false;
  }

  const activeProductCategoryFilter =
    productCategoryFilter || orderedRootCategories[0]?.slug || "";
  const filteredAdminProducts = activeProductCategoryFilter
    ? state.products.filter((product) =>
        isCategoryWithin(product.category, activeProductCategoryFilter),
      )
    : [];
  const activeFilterChildren = allManagedCategories.filter(
    (category) => category.parentSlug === activeProductCategoryFilter,
  );
  const availableProductBrands = productCategorySelection
    ? state.brands.filter((brand) =>
        isCategoryWithin(productCategorySelection, brand.categorySlug),
      )
    : [];
  const groupedAdminProducts = Array.from(
    filteredAdminProducts.reduce((categoriesBySlug, product) => {
      const categoryProducts = categoriesBySlug.get(product.category) ?? [];
      categoryProducts.push(product);
      categoriesBySlug.set(product.category, categoryProducts);
      return categoriesBySlug;
    }, new Map<string, AdminProduct[]>()),
  )
    .sort(([left], [right]) => categoryPathLabel(left).localeCompare(categoryPathLabel(right), "fa"))
    .map(([categorySlug, products]) => ({
      categorySlug,
      brands: Array.from(products.reduce((brandsByName, product) => {
        const managed = state.brands.find((brand) => brand.name === product.brand);
        const brandKey = managed ? managed.name : "برند قدیمی / تعریف‌نشده";
        const brandProducts = brandsByName.get(brandKey) ?? [];
        brandProducts.push(product);
        brandsByName.set(brandKey, brandProducts);
        return brandsByName;
      }, new Map<string, AdminProduct[]>())).sort(([left], [right]) => left.localeCompare(right, "fa")),
    }));

  async function commit(next: AdminState) {
    setSaveStatus("saving");
    setStatusMessage("");
    try {
      const saved = await saveAdminState(next);
      setState(saved);
      setSaveStatus("saved");
      return true;
    } catch (error) {
      setSaveStatus("error");
      setStatusMessage(
        error instanceof Error ? error.message : "ذخیره تغییرات ممکن نشد.",
      );
      return false;
    }
  }

  function revokeProductPreview(url: string) {
    if (!productPreviewUrls.current.delete(url)) return;
    URL.revokeObjectURL(url);
  }

  function clearSelectedProductMedia() {
    for (const url of productPreviewUrls.current) URL.revokeObjectURL(url);
    productPreviewUrls.current.clear();
    setSelectedProductImages([]);
    setSelectedProductVideo(null);
    setRemovedProductImages([]);
    setPrimaryProductImage("");
    setRemoveExistingProductVideo(false);
    setProductMediaInputVersion((version) => version + 1);
  }

  function beginProductEdit(productId: string) {
    const product = state.products.find((item) => item.id === productId);
    clearSelectedProductMedia();
    setEditingProductId(productId);
    setProductEditorVersion((version) => version + 1);
    setPrimaryProductImage(product?.imageUrls[0] ?? "");
    setProductCategorySelection(product?.category ?? "");
    setProductBrandSelection(product?.brand ?? "");
    requestAnimationFrame(() => {
      document.getElementById("product-editor")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function cancelProductEdit() {
    clearSelectedProductMedia();
    setEditingProductId("");
    setProductCategorySelection("");
    setProductBrandSelection("");
  }

  function beginCategoryEdit(categoryId: string) {
    setNewCategoryParentSlug("");
    setEditingCategoryId(categoryId);
    requestAnimationFrame(() => {
      document.getElementById("category-editor")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function beginNewSubcategory(parentSlug: string) {
    setEditingCategoryId("");
    setNewCategoryParentSlug(parentSlug);
    requestAnimationFrame(() => {
      document.getElementById("category-editor")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function cancelCategoryEdit() {
    setEditingCategoryId("");
    setNewCategoryParentSlug("");
  }

  function beginBrandEdit(brandId: string) {
    setNewBrandCategorySlug("");
    setEditingBrandId(brandId);
    requestAnimationFrame(() => {
      document.getElementById("brand-editor")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function beginNewBrand(categorySlug: string) {
    setEditingBrandId("");
    setNewBrandCategorySlug(categorySlug);
    requestAnimationFrame(() => {
      document.getElementById("brand-editor")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function cancelBrandEdit() {
    setEditingBrandId("");
    setNewBrandCategorySlug("");
  }

  async function deleteProduct(productId: string, title: string) {
    if (!can("catalog.delete") || productBusy) return;
    if (!window.confirm(`محصول «${title}» از پنل و فروشگاه حذف شود؟ سوابق سفارش حفظ می‌شوند.`)) return;
    setProductBusy(true);
    setSaveStatus("saving");
    setStatusMessage("");
    try {
      const mode = await removeAdminProduct(productId);
      setState(await loadAdminState());
      if (editingProductId === productId) cancelProductEdit();
      setSaveStatus("saved");
      setStatusMessage(mode === "archived" ? "محصول حذف و سابقه سفارش آن بایگانی شد." : "محصول حذف شد.");
    } catch (error) {
      setSaveStatus("error");
      setStatusMessage(error instanceof Error ? error.message : "حذف محصول ممکن نشد.");
    } finally {
      setProductBusy(false);
    }
  }

  async function deleteProductVariant(productId: string, variantId: string) {
    if (!can("catalog.delete") || productBusy) return;
    if (!window.confirm(VARIANT_DELETE_CONFIRMATION)) return;
    setProductBusy(true);
    setSaveStatus("saving");
    setStatusMessage("");
    try {
      await removeAdminProductVariant(productId, variantId);
      const refreshed = await loadAdminState();
      setState(refreshed);
      const refreshedProduct = refreshed.products.find((product) => product.id === productId);
      setEditingProductId(productId);
      setProductEditorVersion((version) => version + 1);
      setPrimaryProductImage(refreshedProduct?.imageUrls[0] ?? "");
      setSaveStatus("saved");
      setStatusMessage("تنوع انتخاب‌شده حذف شد؛ سایر اطلاعات محصول تغییری نکرد.");
    } catch (error) {
      setSaveStatus("error");
      setStatusMessage(error instanceof Error ? error.message : "حذف تنوع ممکن نشد.");
    } finally {
      setProductBusy(false);
    }
  }

  function toggleSection(section: AdminSectionKey) {
    void commit({
      ...state,
      sections: { ...state.sections, [section]: !state.sections[section] },
    });
  }

  function toggleCategory(categoryId: string) {
    const hiddenCategoryIds = state.hiddenCategoryIds.includes(categoryId)
      ? state.hiddenCategoryIds.filter((id) => id !== categoryId)
      : [...state.hiddenCategoryIds, categoryId];
    void commit({ ...state, hiddenCategoryIds });
  }

  function toggleCategorySafely(category: AdminCategory) {
    const isHidden = state.hiddenCategoryIds.includes(category.slug);
    if (!isHidden) {
      const hasProducts = state.products.some(
        (product) => product.category === category.slug,
      );
      const hasChildren = allManagedCategories.some(
        (child) => child.parentSlug === category.slug,
      );
      if (hasProducts || hasChildren) {
        setSaveStatus("error");
        setStatusMessage(
          "این دسته‌بندی محصول یا زیردسته دارد و تا زمان جابه‌جایی آن‌ها مخفی نمی‌شود.",
        );
        return;
      }
    }
    toggleCategory(category.slug);
  }

  function deleteCustomCategorySafely(category: AdminCategory) {
    if (!can("catalog.delete") || category.system) return;
    const hasProducts = state.products.some((product) => product.category === category.slug);
    const hasChildren = allManagedCategories.some((child) => child.parentSlug === category.slug);
    if (hasProducts || hasChildren) {
      setSaveStatus("error");
      setStatusMessage("برای حذف این دسته ابتدا محصولات و زیردسته‌های وابسته را جابه‌جا یا حذف کنید.");
      return;
    }
    if (!window.confirm(`دسته‌بندی «${category.name}» برای همیشه حذف شود؟`)) return;
    void commit({
      ...state,
      customCategories: state.customCategories.filter((item) => item.id !== category.id),
      categoryOrder: state.categoryOrder.filter((slug) => slug !== category.slug),
      hiddenCategoryIds: state.hiddenCategoryIds.filter((slug) => slug !== category.slug),
    });
  }

  function toggleCustomCategorySafely(category: AdminCategory) {
    if (category.visible) {
      const hasProducts = state.products.some(
        (product) => product.category === category.slug,
      );
      const hasChildren = allManagedCategories.some(
        (child) => child.parentSlug === category.slug,
      );
      if (hasProducts || hasChildren) {
        setSaveStatus("error");
        setStatusMessage(
          "این دسته‌بندی محصول یا زیردسته دارد و تا زمان جابه‌جایی آن‌ها مخفی نمی‌شود.",
        );
        return;
      }
    }
    void commit({
      ...state,
      customCategories: state.customCategories.map((item) =>
        item.id === category.id ? { ...item, visible: !item.visible } : item,
      ),
    });
  }

  function moveCategory(slug: string, direction: -1 | 1) {
    const roots = orderedRootCategories.map((category) => category.slug);
    const index = roots.indexOf(slug);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= roots.length) return;
    [roots[index], roots[target]] = [roots[target]!, roots[index]!];
    void commit({ ...state, categoryOrder: roots });
  }

  async function uploadMedia(
    file: File,
    kind: "products" | "branding" | "product-video" | "banner" | "category",
  ) {
    const upload = new FormData();
    upload.set("file", file);
    upload.set("kind", kind);
    const response = await fetch("/api/admin/upload", {
      method: "POST",
      body: upload,
    });
    const payload = (await response.json()) as {
      url?: string;
      cleanupToken?: string;
      error?: string;
    };
    if (!response.ok || !payload.url || !payload.cleanupToken) {
      throw new Error(payload.error || "بارگذاری فایل ممکن نشد.");
    }
    return { url: payload.url, cleanupToken: payload.cleanupToken };
  }

  async function cleanupUploadedMedia(
    uploads: readonly { url: string; cleanupToken: string }[],
  ) {
    if (uploads.length === 0) return true;
    const response = await fetch("/api/admin/upload", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploads }),
    }).catch(() => null);
    return Boolean(response?.ok);
  }

  async function saveBranding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const siteName = String(data.get("siteName") ?? "").trim();
    const logoAlt = String(data.get("logoAlt") ?? "").trim();
    const file = data.get("logo");
    const pendingUploads: { url: string; cleanupToken: string }[] = [];
    if (!siteName) return;
    setBrandingBusy(true);
    setSaveStatus("saving");
    setStatusMessage("");
    try {
      let logoUrl = data.get("removeLogo") ? "" : state.branding.logoUrl;
      if (file instanceof File && file.size > 0) {
        const uploaded = await uploadMedia(file, "branding");
        pendingUploads.push(uploaded);
        logoUrl = uploaded.url;
      }
      const saved = await commit({
        ...state,
        branding: {
          siteName: siteName.slice(0, 80),
          logoUrl,
          logoAlt: (logoAlt || `لوگوی ${siteName}`).slice(0, 120),
        },
      });
      if (!saved) await cleanupUploadedMedia(pendingUploads);
    } catch (error) {
      const cleanupComplete = await cleanupUploadedMedia(pendingUploads);
      setSaveStatus("error");
      setStatusMessage(
        `${error instanceof Error ? error.message : "ذخیره لوگو ممکن نشد."}${
          cleanupComplete ? "" : " پاک‌سازی فایل موقت نیز ممکن نشد؛ دوباره تلاش کنید."
        }`,
      );
    } finally {
      setBrandingBusy(false);
    }
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const slug = normalizeSlug(String(data.get("slug") ?? ""));
    const description = String(data.get("description") ?? "").trim();
    const parentSlug = normalizeSlug(String(data.get("parentSlug") ?? ""));
    const duplicateSystem = systemCategories.some(
      (category) =>
        category.slug === slug && category.slug !== editingCategory?.slug,
    );
    const duplicateCustom = state.customCategories.some(
      (category) => category.slug === slug && category.id !== editingCategory?.id,
    );
    const parentExists =
      !parentSlug || availableCategories.some((category) => category.slug === parentSlug);
    const selectedParent = allManagedCategories.find(
      (category) => category.slug === parentSlug,
    );
    const parentIsRoot = !parentSlug || Boolean(selectedParent && !selectedParent.parentSlug);
    let parentCursor = parentSlug;
    let createsCycle = false;
    const visited = new Set<string>();
    while (editingCategory && parentCursor && !visited.has(parentCursor)) {
      if (parentCursor === editingCategory.slug) {
        createsCycle = true;
        break;
      }
      visited.add(parentCursor);
      parentCursor =
        state.customCategories.find((category) => category.slug === parentCursor)
          ?.parentSlug ?? "";
    }
    if (!name || !slug || duplicateSystem || duplicateCustom) {
      setSaveStatus("error");
      setStatusMessage(
        duplicateSystem || duplicateCustom
          ? "نامک این دسته‌بندی قبلاً استفاده شده است."
          : "نام و نامک دسته‌بندی را کامل کنید.",
      );
      return;
    }
    if (!parentExists || !parentIsRoot || createsCycle) {
      setSaveStatus("error");
      setStatusMessage(
        createsCycle
          ? "یک دسته‌بندی نمی‌تواند زیرمجموعه خودش یا زیرمجموعه‌هایش باشد."
          : !parentIsRoot
            ? "زیر‌دسته باید مستقیماً به یک دستهٔ مادر متصل شود."
          : "دستهٔ مادر انتخاب‌شده معتبر نیست.",
      );
      return;
    }
    const imageFile = data.get("image");
    const pendingUploads: { url: string; cleanupToken: string }[] = [];
    setCategoryBusy(true);
    setSaveStatus("saving");
    setStatusMessage("");
    try {
      let imageUrl = data.get("removeImage") ? "" : editingCategory?.imageUrl ?? "";
      if (imageFile instanceof File && imageFile.size > 0) {
        const uploaded = await uploadMedia(imageFile, "category");
        pendingUploads.push(uploaded);
        imageUrl = uploaded.url;
      }
      const nextCategory: AdminCategory = {
      id: editingCategory?.id ?? createAdminId("category"),
      slug,
      name: name.slice(0, 120),
      description: description.slice(0, 500),
      parentSlug: parentSlug === slug ? "" : parentSlug,
      imageUrl,
      imageHidden: data.get("hideDefaultImage") === "on",
      system: editingCategory?.system ?? false,
      visible: editingCategory?.visible ?? true,
      };
      const alreadyPersisted = state.customCategories.some(
        (category) => category.id === nextCategory.id,
      );
      const saved = await commit({
        ...state,
        customCategories: alreadyPersisted
          ? state.customCategories.map((category) =>
              category.id === nextCategory.id ? nextCategory : category,
            )
          : [
              ...state.customCategories.filter(
                (category) => category.slug !== nextCategory.slug,
              ),
              nextCategory,
            ],
      });
      if (saved) {
        form.reset();
        cancelCategoryEdit();
      } else {
        await cleanupUploadedMedia(pendingUploads);
      }
    } catch (error) {
      const cleanupComplete = await cleanupUploadedMedia(pendingUploads);
      setSaveStatus("error");
      setStatusMessage(
        `${error instanceof Error ? error.message : "ذخیره دسته‌بندی ممکن نشد."}${
          cleanupComplete ? "" : " پاک‌سازی فایل موقت نیز ممکن نشد؛ دوباره تلاش کنید."
        }`,
      );
    } finally {
      setCategoryBusy(false);
    }
  }

  function saveBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const slug = normalizeSlug(String(data.get("slug") ?? "")) || stableBrandSlug(name);
    const categorySlug = normalizeSlug(String(data.get("categorySlug") ?? ""));
    if (!name || !slug || !availableCategories.some((category) => category.slug === categorySlug)) {
      setSaveStatus("error");
      setStatusMessage("نام برند و دستهٔ مربوط به آن را کامل کنید.");
      return;
    }
    if (
      state.brands.some(
        (brand) =>
          brand.slug === slug && brand.id !== editingBrand?.id,
      )
    ) {
      setSaveStatus("error");
      setStatusMessage("نامک این برند قبلاً استفاده شده است.");
      return;
    }
    const nextBrand: AdminBrand = {
      id: editingBrand?.id ?? createAdminId("brand"),
      slug,
      name: name.slice(0, 100),
      categorySlug,
    };
    void commit({
      ...state,
      brands: editingBrand
        ? state.brands.map((brand) => brand.id === editingBrand.id ? nextBrand : brand)
        : [...state.brands, nextBrand],
    }).then((saved) => {
      if (!saved) return;
      form.reset();
      cancelBrandEdit();
    });
  }

  function deleteBrandSafely(brand: AdminBrand) {
    if (!can("catalog.delete")) return;
    const hasProducts = state.products.some(
      (product) => product.brand.trim().toLocaleLowerCase("fa") === brand.name.trim().toLocaleLowerCase("fa"),
    );
    if (hasProducts) {
      setSaveStatus("error");
      setStatusMessage("این برند محصول دارد و تا زمان جابه‌جایی محصولات حذف نمی‌شود.");
      return;
    }
    if (!window.confirm(`برند «${brand.name}» حذف شود؟`)) return;
    void commit({
      ...state,
      brands: state.brands.filter((item) => item.id !== brand.id),
    });
  }

  function saveHeaderMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = String(data.get("text") ?? "").trim();
    if (!text) return;
    const start = optionalCalendarDateTime(data, "startsDate", "startsTime", calendarMode);
    const end = optionalCalendarDateTime(data, "endsDate", "endsTime", calendarMode);
    if (!start.valid || !end.valid) {
      setSaveStatus("error");
      setStatusMessage("تاریخ و ساعت پیام را کامل و مطابق تقویم انتخاب‌شده وارد کنید.");
      return;
    }
    const startsAt = start.iso;
    const endsAt = end.iso;
    if (startsAt && endsAt && Date.parse(startsAt) >= Date.parse(endsAt)) {
      setSaveStatus("error");
      setStatusMessage("زمان پایان پیام باید بعد از زمان شروع باشد.");
      return;
    }
    const nextMessage = {
      id: editingMessage?.id ?? createAdminId("message"),
      text: text.slice(0, 160),
      href: normalizeAdminHref(String(data.get("href") ?? "")),
      startsAt,
      endsAt,
      backgroundColor: String(data.get("backgroundColor") ?? "#4f46e5"),
      textColor: String(data.get("textColor") ?? "#ffffff"),
      visible: editingMessage?.visible ?? true,
    };
    void commit({
      ...state,
      headerMessages: editingMessage
        ? state.headerMessages.map((message) =>
            message.id === editingMessage.id ? nextMessage : message,
          )
        : [...state.headerMessages, nextMessage],
    });
    form.reset();
    setEditingMessageId("");
  }

  function saveAmazingSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const selectionValue = String(data.get("selectionMode") ?? "amazing");
    const selectionMode =
      selectionValue === "placement" || selectionValue === "discounted"
        ? selectionValue
        : "amazing";
    const itemLimit = Math.max(
      3,
      Math.min(30, Math.trunc(Number(data.get("itemLimit") || 12))),
    );
    const endDate = String(data.get("endsDate") ?? "");
    const endTime = String(data.get("endsTime") ?? "");
    const endsAt = endDate || endTime
      ? calendarDateTimeToIso(endDate, endTime, calendarMode)
      : "";
    if ((endDate || endTime) && !endsAt) {
      setSaveStatus("error");
      setStatusMessage("تاریخ پایان شگفت‌انگیز را مطابق تقویم انتخاب‌شده وارد کنید.");
      return;
    }
    void commit({
      ...state,
      amazingSection: {
        title:
          String(data.get("title") ?? "").trim().slice(0, 120) ||
          "پیشنهاد شگفت‌انگیز",
        subtitle: String(data.get("subtitle") ?? "").trim().slice(0, 180),
        href: normalizeAdminHref(String(data.get("href") ?? "/offers")),
        linkLabel:
          String(data.get("linkLabel") ?? "").trim().slice(0, 60) ||
          "مشاهده همه",
        backgroundColor: String(data.get("backgroundColor") ?? "#ef3340"),
        textColor: String(data.get("textColor") ?? "#ffffff"),
        selectionMode,
        itemLimit,
        endsAt,
        showTimer: data.get("showTimer") === "on",
      },
    });
  }

  async function saveBanner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    if (!title) return;
    const scope: "home" | "category" = String(data.get("scope") ?? "home") === "category"
      ? "category"
      : "home";
    const categorySlug = scope === "category"
      ? normalizeSlug(String(data.get("categorySlug") ?? ""))
      : "";
    if (
      scope === "category" &&
      !orderedRootCategories.some((category) => category.slug === categorySlug)
    ) {
      setSaveStatus("error");
      setStatusMessage("برای بنر دسته‌بندی، یک دستهٔ مادر معتبر انتخاب کنید.");
      return;
    }
    const start = optionalCalendarDateTime(data, "startsDate", "startsTime", calendarMode);
    const end = optionalCalendarDateTime(data, "endsDate", "endsTime", calendarMode);
    if (!start.valid || !end.valid) {
      setSaveStatus("error");
      setStatusMessage("تاریخ و ساعت بنر را کامل و مطابق تقویم انتخاب‌شده وارد کنید.");
      return;
    }
    const startsAt = start.iso;
    const endsAt = end.iso;
    if (startsAt && endsAt && Date.parse(startsAt) >= Date.parse(endsAt)) {
      setSaveStatus("error");
      setStatusMessage("زمان پایان بنر باید بعد از زمان شروع باشد.");
      return;
    }
    const desktopFile = data.get("desktopImage");
    const mobileFile = data.get("mobileImage");
    const pendingUploads: { url: string; cleanupToken: string }[] = [];
    setBannerBusy(true);
    setSaveStatus("saving");
    setStatusMessage("");
    try {
      let desktopImageUrl = data.get("removeDesktopImage")
        ? ""
        : editingBanner?.desktopImageUrl ?? "";
      let mobileImageUrl = data.get("removeMobileImage")
        ? ""
        : editingBanner?.mobileImageUrl ?? "";
      if (desktopFile instanceof File && desktopFile.size > 0) {
        const uploaded = await uploadMedia(desktopFile, "banner");
        pendingUploads.push(uploaded);
        desktopImageUrl = uploaded.url;
      }
      if (mobileFile instanceof File && mobileFile.size > 0) {
        const uploaded = await uploadMedia(mobileFile, "banner");
        pendingUploads.push(uploaded);
        mobileImageUrl = uploaded.url;
      }
      if (!desktopImageUrl) {
        throw new Error("تصویر اصلی بنر را انتخاب کنید.");
      }
      const nextBanner = {
        id: editingBanner?.id ?? createAdminId("banner"),
        title: title.slice(0, 160),
        altText: String(data.get("altText") ?? title).trim().slice(0, 180),
        href: normalizeAdminHref(String(data.get("href") ?? "")),
        desktopImageUrl,
        mobileImageUrl,
        placement: String(data.get("placement") ?? "wide") as "wide" | "half",
        scope,
        categorySlug,
        startsAt,
        endsAt,
        visible: editingBanner?.visible ?? true,
      };
      const saved = await commit({
        ...state,
        banners: editingBanner
          ? state.banners.map((banner) =>
              banner.id === editingBanner.id ? nextBanner : banner,
            )
          : [...state.banners, nextBanner],
      });
      if (saved) {
        form.reset();
        setEditingBannerId("");
      } else {
        await cleanupUploadedMedia(pendingUploads);
      }
    } catch (error) {
      const cleanupComplete = await cleanupUploadedMedia(pendingUploads);
      setSaveStatus("error");
      setStatusMessage(
        `${error instanceof Error ? error.message : "ذخیره بنر ممکن نشد."}${
          cleanupComplete ? "" : " پاک‌سازی فایل موقت نیز ممکن نشد؛ دوباره تلاش کنید."
        }`,
      );
    } finally {
      setBannerBusy(false);
    }
  }

  function moveItem<T extends { id: string }>(items: T[], id: string, direction: -1 | 1) {
    const index = items.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return items;
    const next = [...items];
    [next[index], next[target]] = [next[target]!, next[index]!];
    return next;
  }

  function reportProductValidation(
    form: HTMLFormElement,
    fieldName?: string,
    message?: string,
  ) {
    const focusedField = focusProductControl(form, fieldName);
    const nextMessage = message ??
      PRODUCT_FIELD_VALIDATION_MESSAGES[focusedField] ??
      PRODUCT_VALIDATION_MESSAGE;
    setActiveProductValidation(
      focusedField ? { fieldName: focusedField, message: nextMessage } : null,
    );
    setSaveStatus("error");
    setStatusMessage(nextMessage);
  }

  async function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    form.querySelectorAll('[aria-invalid="true"]').forEach((control) => control.removeAttribute("aria-invalid"));
    if (!form.checkValidity()) {
      reportProductValidation(form);
      return;
    }
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const slug = normalizeSlug(String(data.get("slug") ?? ""));
    const sku = String(data.get("sku") ?? "").trim().toUpperCase().slice(0, 80);
    const brand = String(data.get("brand") ?? "").trim().slice(0, 100);
    const category = normalizeSlug(String(data.get("category") ?? ""));
    const currency = IRAN_CURRENCY;
    const priceUnit = String(data.get("priceUnit") ?? "toman") === "rial"
      ? "rial"
      : "toman";
    const basePrice = Number(data.get("basePrice"));
    const discountType = String(
      data.get("discountType") ?? "none",
    ) as AdminProductDiscountType;
    const discountValue = Number(data.get("discountValue") || 0);
    const discountUnit = String(data.get("discountUnit") ?? "toman") === "rial"
      ? "rial"
      : "toman";
    const stockQuantity = Number(data.get("stockQuantity"));
    const files = selectedProductImages.filter((item) => item.file.size > 0);
    const videoFile = selectedProductVideo?.file ?? null;
    const pendingUploads: { url: string; cleanupToken: string }[] = [];
    const amazingEnabled = data.get("amazingEnabled") === "on";
    const amazingStartsAt = calendarDateTimeToIso(
      String(data.get("amazingStartsDate") ?? ""),
      String(data.get("amazingStartsTime") ?? ""),
      calendarMode,
    );
    const amazingEndsAt = calendarDateTimeToIso(
      String(data.get("amazingEndsDate") ?? ""),
      String(data.get("amazingEndsTime") ?? ""),
      calendarMode,
    );
    const removedImages = new Set(removedProductImages);
    if (
      !title ||
      !slug ||
      !sku ||
      !brand ||
      !selectableCategories.some((item) => item.slug === category) ||
      !Number.isFinite(basePrice) ||
      basePrice < 0 ||
      !Number.isFinite(discountValue) ||
      discountValue < 0 ||
      !Number.isSafeInteger(stockQuantity) ||
      stockQuantity < (editingProduct?.reservedQuantity ?? 0)
    ) {
      const fieldName = !title
        ? "title"
        : !slug
          ? "slug"
          : !sku
            ? "sku"
            : !selectableCategories.some((item) => item.slug === category)
              ? "category"
              : !brand
                ? "brand"
                : !Number.isFinite(basePrice) || basePrice < 0
                  ? "basePrice"
                  : !Number.isFinite(discountValue) || discountValue < 0
                    ? "discountValue"
                    : "stockQuantity";
      reportProductValidation(form, fieldName);
      return;
    }

    setActiveProductValidation(null);
    setProductBusy(true);
    setSaveStatus("saving");
    setStatusMessage("");
    try {
      if (
        state.products.some(
          (product) =>
            product.slug === slug && product.id !== editingProduct?.id,
        )
      ) {
        throw new ProductValidationError("نامک این محصول قبلاً استفاده شده است.");
      }
      const managedBrand = state.brands.find(
        (item) => item.name.trim().toLocaleLowerCase("fa") === brand.toLocaleLowerCase("fa"),
      );
      const unchangedLegacyBrand = Boolean(
        editingProduct &&
        editingProduct.category === category &&
        editingProduct.brand === brand,
      );
      if (
        managedBrand &&
        !isCategoryWithin(category, managedBrand.categorySlug) &&
        !unchangedLegacyBrand
      ) {
        throw new ProductValidationError(
          `برند «${managedBrand.name}» فقط در ${categoryPathLabel(managedBrand.categorySlug)} قابل انتخاب است.`,
        );
      }
      if (
        state.products.some(
          (product) => product.sku === sku && product.id !== editingProduct?.id,
        )
      ) {
        throw new ProductValidationError("کد کالا (SKU) تکراری است.");
      }
      if (!(["none", "percentage", "amount"] as const).includes(discountType)) {
        throw new ProductValidationError("نوع تخفیف معتبر نیست.", "discountType");
      }
      if (discountType === "percentage" && discountValue > 100) {
        throw new ProductValidationError("درصد تخفیف باید بین صفر تا صد باشد.");
      }
      const discount = calculateProductDiscount({
        basePrice,
        priceUnit,
        discountType,
        discountValue,
        discountUnit,
      });
      if (
        !Number.isSafeInteger(discount.basePriceRial) ||
        !Number.isSafeInteger(discount.discountRial) ||
        !Number.isSafeInteger(discount.finalPriceRial)
      ) {
        throw new ProductValidationError("مبلغ واردشده بزرگ‌تر از محدودهٔ امن قیمت است.");
      }
      if (
        amazingEnabled &&
        (!amazingStartsAt ||
          !amazingEndsAt ||
          Date.parse(amazingStartsAt) >= Date.parse(amazingEndsAt))
      ) {
        throw new ProductValidationError("برای پیشنهاد شگفت‌انگیز، شروع و پایان معتبر وارد کنید.");
      }
      const preservedImages = (editingProduct?.imageUrls ?? []).filter(
        (url) => !removedImages.has(url),
      );
      if (preservedImages.length + files.length > MAX_PRODUCT_IMAGES) {
        throw new ProductValidationError("برای هر محصول حداکثر ۱۰ تصویر مجاز است.");
      }
      const uploadedImages: { key: string; url: string }[] = [];
      for (const item of files) {
        const optimizedFile = await optimizeProductImageForWeb(item.file);
        const uploaded = await uploadMedia(optimizedFile, "products");
        pendingUploads.push(uploaded);
        uploadedImages.push({ key: item.key, url: uploaded.url });
      }
      const imageEntries = [
        ...preservedImages.map((url) => ({ key: url, url })),
        ...uploadedImages.map((item) => ({ key: `new:${item.key}`, url: item.url })),
      ];
      const selectedPrimary = imageEntries.find((item) => item.key === primaryProductImage);
      const primaryEntry = selectedPrimary ?? imageEntries[0];
      const imageUrls = primaryEntry
        ? [primaryEntry.url, ...imageEntries.filter((item) => item !== primaryEntry).map((item) => item.url)]
        : [];
      let videoUrl = removeExistingProductVideo ? "" : editingProduct?.videoUrl ?? "";
      if (videoFile instanceof File && videoFile.size > 0) {
        const uploaded = await uploadMedia(videoFile, "product-video");
        pendingUploads.push(uploaded);
        videoUrl = uploaded.url;
      }

      const knownDefinitions = new Map<string, {
        definitionId: string;
        code: string;
        label: string;
        dataType: AdminAttributeDataType;
        unit: string | null;
        filterable: boolean;
        searchable: boolean;
        comparable: boolean;
      }>();
      for (const catalogProduct of state.products) {
        for (const attribute of [
          ...(catalogProduct.attributes ?? []),
          ...catalogProduct.variants.flatMap((variant) => variant.attributes ?? []),
        ]) {
          knownDefinitions.set(`${catalogProduct.category}:${attribute.code}`, attribute);
        }
      }

      function readNewAttribute(prefix: string) {
        const code = normalizeAttributeCode(String(data.get(`${prefix}Code`) ?? ""));
        const label = String(data.get(`${prefix}Label`) ?? "").trim().slice(0, 100);
        const value = String(data.get(`${prefix}Value`) ?? "").trim().slice(0, 500);
        if (!code && !label && !value) return null;
        if (!code || !label || !value) {
          throw new ProductValidationError("کد، عنوان و مقدار ویژگی جدید باید کامل باشد.", `${prefix}Value`);
        }
        const requestedDataType = String(data.get(`${prefix}DataType`) ?? "text");
        const dataType: AdminAttributeDataType = requestedDataType === "number" || requestedDataType === "boolean"
          ? requestedDataType
          : "text";
        if (dataType === "number" && !Number.isFinite(Number(value))) {
          throw new ProductValidationError(`مقدار عددی ویژگی «${label}» معتبر نیست.`, `${prefix}Value`);
        }
        if (dataType === "boolean" && value !== "true" && value !== "false") {
          throw new ProductValidationError(`مقدار بله/خیر ویژگی «${label}» معتبر نیست.`, `${prefix}Value`);
        }
        const scopedCode = `${category}:${code}`;
        const known = knownDefinitions.get(scopedCode);
        const definition = known ?? {
          definitionId: createAdminId("attribute-definition"),
          code,
          label,
          dataType,
          unit: String(data.get(`${prefix}Unit`) ?? "").trim().slice(0, 40) || null,
          filterable: data.get(`${prefix}Filterable`) === "on",
          searchable: data.get(`${prefix}Searchable`) === "on",
          comparable: data.get(`${prefix}Comparable`) === "on",
        };
        if (known && (known.label !== label || known.dataType !== dataType)) {
          throw new ProductValidationError(`کد ویژگی «${code}» قبلاً با تعریف دیگری ثبت شده است.`, `${prefix}Code`);
        }
        knownDefinitions.set(scopedCode, definition);
        return {
          id: createAdminId("attribute-value"),
          ...definition,
          value,
        };
      }

      const productAttributes = (editingProduct?.attributes ?? [])
        .filter((attribute) => data.get(`attributeDelete-${attribute.id}`) !== "on")
        .map((attribute, index) => ({
          ...attribute,
          value: String(data.get(`attributeValue-${attribute.id}`) ?? attribute.value).trim().slice(0, 500),
          keyFeature: data.get(`attributeKey-${attribute.id}`) === "on",
          sortOrder: index,
        }));
      const newProductAttribute = readNewAttribute("newProductAttribute");
      if (newProductAttribute) {
        productAttributes.push({
          ...newProductAttribute,
          keyFeature: data.get("newProductAttributeKey") === "on",
          sortOrder: productAttributes.length,
        });
      }

      const variants = (editingProduct?.variants ?? []).map((variant) => ({
          ...variant,
          title: String(data.get(`variantTitle-${variant.id}`) ?? variant.title).trim().slice(0, 120),
          sku: String(data.get(`variantSku-${variant.id}`) ?? variant.sku).trim().toUpperCase().slice(0, 80),
          priceMinor: priceInputToRial(Number(data.get(`variantPrice-${variant.id}`) || 0), priceUnit),
          compareAtPriceMinor: priceInputToRial(Number(data.get(`variantCompareAt-${variant.id}`) || 0), priceUnit),
          stockQuantity: Math.max(variant.reservedQuantity, Math.trunc(Number(data.get(`variantStock-${variant.id}`) || 0))),
          attributes: (variant.attributes ?? [])
            .filter((attribute) => data.get(`variantAttributeDelete-${attribute.id}`) !== "on")
            .map((attribute) => ({
              ...attribute,
              value: String(data.get(`variantAttributeValue-${attribute.id}`) ?? attribute.value).trim().slice(0, 500),
            })),
          visible: data.get(`variantVisible-${variant.id}`) === "on",
        }));
      for (const variant of variants) {
        const newAttribute = readNewAttribute(`newVariantAttribute-${variant.id}`);
        if (newAttribute) variant.attributes.push(newAttribute);
      }
      const newVariantTitle = String(data.get("newVariantTitle") ?? "").trim();
      if (newVariantTitle) {
        variants.push({
          id: createAdminId("variant"),
          title: newVariantTitle.slice(0, 120),
          sku: String(data.get("newVariantSku") ?? "").trim().toUpperCase().slice(0, 80),
          priceMinor: priceInputToRial(Number(data.get("newVariantPrice") || 0), priceUnit),
          compareAtPriceMinor: priceInputToRial(Number(data.get("newVariantCompareAt") || 0), priceUnit),
          stockQuantity: Math.max(0, Math.trunc(Number(data.get("newVariantStock") || 0))),
          reservedQuantity: 0,
          attributes: [],
          visible: true,
        });
        const newVariantAttribute = readNewAttribute("newVariantAttribute");
        if (newVariantAttribute) variants.at(-1)?.attributes.push(newVariantAttribute);
      }
      const variantSkus = variants.map((variant) => variant.sku).filter(Boolean);
      if (new Set(variantSkus).size !== variantSkus.length || variantSkus.includes(sku)) {
        throw new ProductValidationError("کد SKU محصول و تنوع‌ها باید یکتا باشد.");
      }
      const otherCatalogSkus = new Set(
        state.products
          .filter((product) => product.id !== editingProduct?.id)
          .flatMap((product) => [product.sku, ...product.variants.map((variant) => variant.sku)])
          .filter(Boolean),
      );
      if (otherCatalogSkus.has(sku) || variantSkus.some((item) => otherCatalogSkus.has(item))) {
        throw new ProductValidationError("SKU محصول یا یکی از تنوع‌ها در کاتالوگ دیگری استفاده شده است.");
      }
      for (const variant of variants) {
        if (!variant.title || !variant.sku || variant.priceMinor < 0) {
          throw new ProductValidationError("عنوان، SKU و قیمت هر تنوع باید کامل باشد.");
        }
        if (variant.compareAtPriceMinor > 0 && variant.compareAtPriceMinor <= variant.priceMinor) {
          throw new ProductValidationError(`قیمت قبل از تخفیف تنوع «${variant.title}» معتبر نیست.`);
        }
      }
      for (const attributeGroup of [
        productAttributes,
        ...variants.map((variant) => variant.attributes),
      ]) {
        const codes = new Set<string>();
        for (const attribute of attributeGroup) {
          if (!attribute.value) throw new ProductValidationError(`مقدار ویژگی «${attribute.label}» خالی است.`);
          if (codes.has(attribute.code)) throw new ProductValidationError(`ویژگی «${attribute.label}» تکراری است.`);
          if (attribute.dataType === "number" && !Number.isFinite(Number(attribute.value))) {
            throw new ProductValidationError(`مقدار عددی ویژگی «${attribute.label}» معتبر نیست.`);
          }
          codes.add(attribute.code);
        }
      }

      const sellerOffers = can("security.write")
        ? eligibleSellers
            .filter((seller) => data.get(`sellerEnabled-${seller.id}`) === "on")
            .map((seller) => {
              const existing = editingProduct?.sellerOffers.find((offer) => offer.sellerId === seller.id);
              return {
                id: existing?.id ?? createAdminId("seller-offer"),
                sellerId: seller.id,
                sellerName: seller.storeName,
                priceMinor: priceInputToRial(Number(data.get(`sellerPrice-${seller.id}`) || 0), priceUnit),
                stockQuantity: Math.max(existing?.reservedQuantity ?? 0, Math.trunc(Number(data.get(`sellerStock-${seller.id}`) || 0))),
                reservedQuantity: existing?.reservedQuantity ?? 0,
                guaranteeLabel: String(data.get(`sellerGuarantee-${seller.id}`) ?? "").trim().slice(0, 160),
                deliveryLabel: String(data.get(`sellerDelivery-${seller.id}`) ?? "").trim().slice(0, 160),
                visible: true,
              };
            })
        : editingProduct?.sellerOffers ?? [];

      const nextProduct = {
        id: editingProduct?.id ?? createAdminId("product"),
        title: title.slice(0, 180),
        englishTitle: String(data.get("englishTitle") ?? "").trim().slice(0, 180) || null,
        slug,
        brand,
        category,
        sku,
        shortDescription: String(data.get("shortDescription") ?? "").trim().slice(0, 500) || null,
        description: String(data.get("description") ?? "").trim().slice(0, 2000),
        placement: String(
          data.get("placement") ?? "special-offers",
        ) as AdminProductPlacement,
        currency,
        priceMinor: discount.finalPriceRial,
        compareAtPriceMinor:
          discount.discountRial > 0 ? discount.basePriceRial : 0,
        discountType: discount.discountType,
        discountValue: discount.discountValue,
        stockQuantity,
        reservedQuantity: editingProduct?.reservedQuantity ?? 0,
        imageUrls,
        videoUrl,
        amazingEnabled,
        amazingStartsAt: amazingEnabled ? amazingStartsAt : "",
        amazingEndsAt: amazingEnabled ? amazingEndsAt : "",
        attributes: productAttributes,
        variants,
        sellerOffers,
        visible: editingProduct?.visible ?? true,
      };
      const next: AdminState = {
        ...state,
        products: editingProduct
          ? state.products.map((product) =>
              product.id === editingProduct.id ? nextProduct : product,
            )
          : [nextProduct, ...state.products],
      };
      const saved = await commit(next);
      if (!saved) {
        await cleanupUploadedMedia(pendingUploads);
        return;
      }
      form.reset();
      clearSelectedProductMedia();
      setEditingProductId(nextProduct.id);
      setProductEditorVersion((version) => version + 1);
      setPrimaryProductImage(nextProduct.imageUrls[0] ?? "");
      setProductCategorySelection(nextProduct.category);
      setProductBrandSelection(nextProduct.brand);
      setLastSavedProductSlug(nextProduct.slug);
    } catch (error) {
      const cleanupComplete = await cleanupUploadedMedia(pendingUploads);
      const message = error instanceof Error ? error.message : "ساخت محصول ممکن نشد.";
      const fullMessage = `${message}${
        cleanupComplete ? "" : " پاک‌سازی فایل موقت نیز ممکن نشد؛ دوباره تلاش کنید."
      }`;
      if (error instanceof ProductValidationError) {
        reportProductValidation(form, error.fieldName, fullMessage);
      } else {
        setActiveProductValidation(null);
        setSaveStatus("error");
        setStatusMessage(fullMessage);
        focusProductControl(form, productErrorField(message));
      }
    } finally {
      setProductBusy(false);
    }
  }

  async function updateOrder(order: StoreOrder, status: OrderStatus) {
    setSaveStatus("saving");
    setStatusMessage("");
    try {
      const updated = await updateAdminOrderStatus(order.id, status);
      setOrders((items) =>
        items.map((item) => item.id === updated.id ? updated : item),
      );
      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("error");
      setStatusMessage(
        error instanceof Error ? error.message : "به‌روزرسانی سفارش ممکن نشد.",
      );
    }
  }

  async function deleteOrder(order: StoreOrder) {
    if (!can("orders.delete") || orderBusy) return;
    const warning = order.paymentStatus === "paid"
      ? `سفارش پرداخت‌شده «${order.orderNumber}» برای همیشه حذف شود؟ این کار سابقه مالی و اقلام سفارش را پاک می‌کند و قابل بازگشت نیست.`
      : `سفارش «${order.orderNumber}» و تمام اطلاعات وابسته برای همیشه حذف شود؟`;
    if (!window.confirm(warning)) return;
    setOrderBusy(true);
    setSaveStatus("saving");
    setStatusMessage("");
    try {
      await removeAdminOrder(order.id);
      setOrders((items) => items.filter((item) => item.id !== order.id));
      setBankTransferReceipts((items) => items.filter((item) => item.orderId !== order.id));
      setSelectedOrderId("");
      setSaveStatus("saved");
      setStatusMessage("سفارش و اطلاعات وابسته حذف شد.");
    } catch (error) {
      setSaveStatus("error");
      setStatusMessage(error instanceof Error ? error.message : "حذف سفارش ممکن نشد.");
    } finally {
      setOrderBusy(false);
    }
  }

  async function saveSellerReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSeller) return;
    const data = new FormData(event.currentTarget);
    const amount = Number(data.get("guaranteeAmount") || 0);
    const guaranteeUnit = String(data.get("guaranteeUnit") ?? "toman") === "rial"
      ? "rial"
      : "toman";
    const review: SellerAdminUpdate = {
      storeName: String(data.get("storeName") ?? "").trim().slice(0, 120),
      contactName: String(data.get("contactName") ?? "").trim().slice(0, 120),
      email: String(data.get("email") ?? "").trim().toLowerCase().slice(0, 200),
      phone: String(data.get("phone") ?? "").trim().slice(0, 40),
      category: String(data.get("category") ?? "").trim().slice(0, 100),
      legalType: String(data.get("legalType")) === "company" ? "company" : "individual",
      registrationNumber: String(data.get("registrationNumber") ?? "").trim().slice(0, 120),
      address: String(data.get("address") ?? "").trim().slice(0, 500),
      notes: String(data.get("notes") ?? "").trim().slice(0, 1000),
      status: String(data.get("status")) as SellerAdminUpdate["status"],
      documentStatus: String(
        data.get("documentStatus"),
      ) as SellerAdminUpdate["documentStatus"],
      guaranteeStatus: String(
        data.get("guaranteeStatus"),
      ) as SellerAdminUpdate["guaranteeStatus"],
      agreementStatus: String(
        data.get("agreementStatus"),
      ) as SellerAdminUpdate["agreementStatus"],
      guaranteeType: String(
        data.get("guaranteeType"),
      ) as SellerAdminUpdate["guaranteeType"],
      guaranteeAmountMinor: Number.isFinite(amount)
        ? priceInputToRial(amount, guaranteeUnit)
        : 0,
      adminNotes: String(data.get("adminNotes") ?? "").slice(0, 2000),
    };
    if (
      review.status === "approved" &&
      !canApproveSeller({ ...selectedSeller, ...review })
    ) {
      setSaveStatus("error");
      setStatusMessage(
        "قبل از تأیید نهایی باید حداقل یک مدرک دریافت و تأیید، ضمانت تأیید یا معاف، و قرارداد امضا شده باشد.",
      );
      return;
    }
    setSellerBusy(true);
    setSaveStatus("saving");
    setStatusMessage("");
    try {
      await updateSellerApplicationStatus(selectedSeller.id, review);
      setSellers((items) =>
        items.map((item) =>
          item.id === selectedSeller.id ? { ...item, ...review } : item,
        ),
      );
      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("error");
      setStatusMessage(
        error instanceof Error ? error.message : "به‌روزرسانی ممکن نشد.",
      );
    } finally {
      setSellerBusy(false);
    }
  }

  async function deleteSeller(seller: SellerApplication) {
    if (!can("sellers.delete") || sellerBusy) return;
    if (!window.confirm(`فروشنده «${seller.storeName}»، پیشنهادهای فروش و مدارک خصوصی او برای همیشه حذف شوند؟`)) return;
    setSellerBusy(true);
    setSaveStatus("saving");
    setStatusMessage("");
    try {
      await removeSellerApplication(seller.id);
      setSellers((items) => items.filter((item) => item.id !== seller.id));
      setSelectedSellerId("");
      setSaveStatus("saved");
      setStatusMessage("فروشنده، پیشنهادها و مدارک خصوصی او حذف شد.");
    } catch (error) {
      setSaveStatus("error");
      setStatusMessage(error instanceof Error ? error.message : "حذف فروشنده ممکن نشد.");
    } finally {
      setSellerBusy(false);
    }
  }

  function saveOwnerSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!can("security.write")) return;
    const data = new FormData(event.currentTarget);
    const selectedCalendar = String(data.get("calendarMode"));
    const deliveryUnit = String(data.get("deliveryFeeUnit")) === "rial" ? "rial" : "toman";
    const bankTransferEnabled = data.get("bankTransferEnabled") === "on";
    const cardNumber = normalizeCardNumber(String(data.get("bankTransferCardNumber") ?? ""));
    const accountHolder = String(data.get("bankTransferAccountHolder") ?? "").trim();
    if (
      bankTransferEnabled &&
      (!isValidIranianCardNumber(cardNumber) || accountHolder.length < 3)
    ) {
      setSaveStatus("error");
      setStatusMessage("برای فعال‌سازی کارت‌به‌کارت، شماره کارت معتبر ۱۶ رقمی و نام صاحب کارت را وارد کنید.");
      return;
    }
    void commit({
      ...state,
      commerce: {
        calendarMode: selectedCalendar === "gregorian" ? "gregorian" : "jalali",
        lowStockThreshold: Math.max(0, Math.min(1000, Math.trunc(Number(data.get("lowStockThreshold") || 5)))),
        reservationMinutes: Math.max(5, Math.min(1440, Math.trunc(Number(data.get("reservationMinutes") || 30)))),
        deliveryFees: {
          standardRial: priceInputToRial(Math.max(0, Number(data.get("standardDeliveryFee") || 0)), deliveryUnit),
          priorityRial: priceInputToRial(Math.max(0, Number(data.get("priorityDeliveryFee") || 0)), deliveryUnit),
        },
        bankTransfer: {
          enabled: bankTransferEnabled,
          cardNumber,
          accountHolder: accountHolder.slice(0, 120),
          bankName: String(data.get("bankTransferBankName") ?? "").trim().slice(0, 80),
          instructions: String(data.get("bankTransferInstructions") ?? "").trim().slice(0, 500),
          reviewHours: Math.max(1, Math.min(72, Math.trunc(Number(data.get("bankTransferReviewHours") || 24)))),
        },
      },
    });
  }

  async function reviewReceipt(status: "approved" | "rejected") {
    if (!selectedOrderReceipt || receiptBusy) return;
    setReceiptBusy(true);
    setSaveStatus("saving");
    setStatusMessage("");
    try {
      const receipt = await reviewAdminBankTransferReceipt(
        selectedOrderReceipt.id,
        status,
        receiptReviewNote,
      );
      setBankTransferReceipts((items) =>
        items.map((item) => item.id === receipt.id ? receipt : item),
      );
      setOrders(await getAdminOrders());
      setReceiptReviewNote("");
      setSaveStatus("saved");
      setStatusMessage(
        status === "approved"
          ? "فیش تأیید و سفارش به‌عنوان پرداخت‌شده ثبت شد."
          : "فیش رد شد؛ سفارش پرداخت‌شده ثبت نشد.",
      );
    } catch (error) {
      setSaveStatus("error");
      setStatusMessage(error instanceof Error ? error.message : "بررسی فیش ممکن نشد.");
    } finally {
      setReceiptBusy(false);
    }
  }

  function addAdminUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (role !== "owner") return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    const displayName = String(data.get("displayName") ?? "").trim();
    const selectedRole = String(data.get("role"));
    const delegatedRole: AdminRole =
      selectedRole === "content_manager" ||
      selectedRole === "order_manager" ||
      selectedRole === "seller_manager"
        ? selectedRole
        : "catalog_manager";
    const selectedPermissions = data.getAll("permissions").filter(
      (permission): permission is (typeof delegableAdminPermissions)[number] =>
        typeof permission === "string" &&
        (delegableAdminPermissions as readonly string[]).includes(permission),
    );
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setSaveStatus("error");
      setStatusMessage("ایمیل مدیر معتبر نیست.");
      return;
    }
    if (state.adminUsers.some((user) => user.email === email)) {
      setSaveStatus("error");
      setStatusMessage("این مدیر قبلاً اضافه شده است.");
      return;
    }
    if (selectedPermissions.length === 0) {
      setSaveStatus("error");
      setStatusMessage("حداقل یک دسترسی برای مدیر انتخاب کنید.");
      return;
    }
    void commit({
      ...state,
      adminUsers: [
        ...state.adminUsers,
        {
          id: createAdminId("admin-user"),
          email,
          displayName: displayName || email,
          role: delegatedRole,
          permissions: ["state.read", ...selectedPermissions],
          active: true,
        },
      ],
    }).then((saved) => {
      if (saved) form.reset();
    });
  }

  async function restoreRevision(id: string) {
    setSaveStatus("saving");
    setStatusMessage("");
    try {
      const restored = await restoreAdminRevision(id);
      setState(restored);
      setRevisions(await getAdminRevisions());
      setSaveStatus("saved");
      setStatusMessage("نسخهٔ انتخاب‌شده با موفقیت بازگردانی شد.");
    } catch (error) {
      setSaveStatus("error");
      setStatusMessage(error instanceof Error ? error.message : "بازگردانی ممکن نشد.");
    }
  }

  const messageCenterText = saveStatus === "idle"
    ? ""
    : saveStatus === "loading"
      ? statusMessage || "در حال اتصال به پایگاه‌داده…"
      : saveStatus === "saving"
        ? "در حال ذخیره…"
        : saveStatus === "error"
          ? statusMessage || "خطا در ذخیره"
          : statusMessage || SAVE_SUCCESS_MESSAGE;

  return (
    <main className={`${styles.page} admin-page`}>
      <header className={styles.topbar}>
        <Container size="wide" className={styles.topbarInner}>
          <div
            className={styles.messageCenter}
            data-status={saveStatus}
            data-empty={!messageCenterText}
            role={saveStatus === "error" ? "alert" : "status"}
            aria-live={saveStatus === "error" ? "assertive" : "polite"}
            aria-atomic="true"
          >
            {messageCenterText ? <span>{messageCenterText}</span> : null}
          </div>
          <div className={styles.userMenu}>
            <strong>پنل مدیریت</strong>
            <span aria-hidden="true">|</span>
            <a href={signOutHref}>خروج</a>
          </div>
        </Container>
      </header>
      <Container size="wide" className={styles.adminBody}>
        <div className={styles.layout} data-products={tab === "products"}>
          <nav className={styles.sidebar} aria-label="بخش‌های مدیریت">
            {(
              [
                ["overview", "نمای کلی"],
                ["content", "محتوا و نمایش"],
                ["categories", "دسته‌ها و برندها"],
                ["banners", "بنرها"],
                ["products", "محصولات"],
                ["orders", "سفارش‌ها"],
                ["customers", "مشتریان"],
                ["reports", "گزارش‌ها"],
                ["sellers", "فروشندگان"],
              ] as const
            ).filter(([value]) =>
              value === "overview" ||
              (value === "content" && can("content.write")) ||
              (value === "categories" && can("catalog.write")) ||
              (value === "banners" && can("content.write")) ||
              (value === "products" && can("catalog.write")) ||
              (value === "orders" && can("orders.write")) ||
              (value === "customers" && (can("customers.read") || can("support.write") || can("reviews.write"))) ||
              (value === "reports" && can("reports.read")) ||
              (value === "sellers" && can("sellers.write")),
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                data-active={tab === value}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className={styles.workspace}>
            {tab === "overview" ? (
              <section aria-labelledby="admin-overview-title">
                <Heading kicker="Dashboard" id="admin-overview-title">
                  نمای کلی مدیریت
                </Heading>
                <div className={styles.stats}>
                  <Stat label="بخش‌های فعال خانه" value={Object.values(state.sections).filter(Boolean).length} />
                  <Stat label="پیام‌های بالای سایت" value={state.headerMessages.length} />
                  <Stat label="محصولات پایگاه‌داده" value={state.products.length} />
                  <Stat label="دسته‌بندی‌های سفارشی" value={state.customCategories.length} />
                  <Stat label="سفارش‌های ثبت‌شده" value={orders.length} />
                  <Stat label="درخواست فروشنده" value={sellers.length} />
                  <Stat label="هشدار موجودی" value={lowStockEntries.length} />
                </div>
                {can("security.write") ? (
                  <article className={`${styles.card} ${styles.readinessCard}`}>
                    <div className={styles.readinessHeading}>
                      <div>
                        <h2>کنترل آمادگی انتشار</h2>
                        <p>ریسک‌های کاتالوگ، موجودی، پرداخت، دامنه، سئو و فروشندگان مستقیم از داده‌های زنده بررسی می‌شوند.</p>
                      </div>
                      {readiness ? (
                        <strong data-ready={readiness.blockerCount === 0}>
                          {readiness.blockerCount === 0
                            ? "بدون مانع بحرانی"
                            : `${readiness.blockerCount.toLocaleString("fa-IR")} مانع انتشار`}
                        </strong>
                      ) : null}
                    </div>
                    {readinessError ? <p role="alert">{readinessError}</p> : null}
                    {!readiness && !readinessError ? <p role="status">در حال بررسی داده‌های زنده…</p> : null}
                    {readiness ? (
                      <div className={styles.readinessList}>
                        {readiness.checks.map((check) => (
                          <div key={check.id} data-status={check.status}>
                            <span aria-hidden="true">
                              {check.status === "ready" ? "✓" : check.status === "warning" ? "!" : "×"}
                            </span>
                            <p><strong>{check.label}</strong><small>{check.detail}</small></p>
                            {check.actionTab ? (
                              <button type="button" onClick={() => setTab(check.actionTab!)}>بررسی بخش</button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ) : null}
                {lowStockEntries.length ? (
                  <article className={styles.card}>
                    <h2>هشدار کاهش موجودی</h2>
                    <ul>
                      {lowStockEntries.slice(0, 20).map((entry) => (
                        <li key={entry.id}>{entry.label}: {entry.available.toLocaleString("fa-IR")} عدد قابل سفارش</li>
                      ))}
                    </ul>
                  </article>
                ) : null}
                {role === "owner" ? <OwnerCredentialSettings /> : null}
                {can("security.write") ? (
                  <article className={styles.card}>
                    <h2>تنظیمات اصلی فروشگاه</h2>
                    <p>تقویم فقط شیوهٔ نمایش و ورود تاریخ را تغییر می‌دهد؛ زمان استاندارد پایگاه‌داده دست‌نخورده باقی می‌ماند.</p>
                    <form className={styles.campaignForm} onSubmit={saveOwnerSettings}>
                      <label>تقویم کل سایت
                        <select name="calendarMode" defaultValue={state.commerce.calendarMode}>
                          <option value="jalali">شمسی</option>
                          <option value="gregorian">میلادی</option>
                        </select>
                      </label>
                      <label>حد هشدار موجودی<input name="lowStockThreshold" type="number" min="0" max="1000" defaultValue={state.commerce.lowStockThreshold} /></label>
                      <label>مدت رزرو موجودی (دقیقه)<input name="reservationMinutes" type="number" min="5" max="1440" defaultValue={state.commerce.reservationMinutes} /></label>
                      <fieldset>
                        <legend>هزینه ارسال</legend>
                        <p>مبلغ هر روش را مالک تعیین می‌کند و همان مبلغ پیش از ثبت سفارش به مشتری نمایش داده می‌شود.</p>
                        <label>واحد ورود مبلغ
                          <select name="deliveryFeeUnit" defaultValue="toman">
                            <option value="toman">تومان</option>
                            <option value="rial">ریال</option>
                          </select>
                        </label>
                        <label>هزینه ارسال استاندارد<input name="standardDeliveryFee" type="number" min="0" step="1" defaultValue={rialToPriceInput(state.commerce.deliveryFees.standardRial, "toman")} /></label>
                        <label>هزینه ارسال سریع<input name="priorityDeliveryFee" type="number" min="0" step="1" defaultValue={rialToPriceInput(state.commerce.deliveryFees.priorityRial, "toman")} /></label>
                      </fieldset>
                      <fieldset>
                        <legend>پرداخت کارت‌به‌کارت</legend>
                        <label><input name="bankTransferEnabled" type="checkbox" defaultChecked={state.commerce.bankTransfer.enabled} /> فعال برای مشتری</label>
                        <p>تا شماره کارت معتبر و نام صاحب کارت ثبت نشود، این روش در فروشگاه فعال نمی‌شود. تصویر فیش به‌تنهایی پرداخت را تأیید نمی‌کند.</p>
                        <label>شماره کارت ۱۶ رقمی<input name="bankTransferCardNumber" inputMode="numeric" dir="ltr" maxLength={24} defaultValue={state.commerce.bankTransfer.cardNumber} placeholder="0000 0000 0000 0000" /></label>
                        <label>نام صاحب کارت<input name="bankTransferAccountHolder" maxLength={120} defaultValue={state.commerce.bankTransfer.accountHolder} /></label>
                        <label>نام بانک (اختیاری)<input name="bankTransferBankName" maxLength={80} defaultValue={state.commerce.bankTransfer.bankName} /></label>
                        <label>راهنمای پرداخت (اختیاری)<textarea name="bankTransferInstructions" maxLength={500} rows={3} defaultValue={state.commerce.bankTransfer.instructions} /></label>
                        <label>مهلت بررسی فیش (ساعت)<input name="bankTransferReviewHours" type="number" min="1" max="72" defaultValue={state.commerce.bankTransfer.reviewHours} /></label>
                      </fieldset>
                      <button type="submit">ذخیره تنظیمات فروشگاه</button>
                    </form>
                    <PaymentGatewaySettings />
                  </article>
                ) : null}
                {role === "owner" ? (
                  <article className={styles.card}>
                    <h2>نقش‌های مدیریتی</h2>
                    <p>مالک می‌تواند همهٔ دسترسی‌های عملیاتی را جداگانه یا ترکیبی به هر مدیر بدهد و هر زمان با برداشتن تیک محدودش کند. هیچ مدیری اجازهٔ تغییر مالک یا سطح دسترسی مدیران را ندارد.</p>
                    <form className={styles.campaignForm} onSubmit={addAdminUser}>
                      <label>نام مدیر<input name="displayName" maxLength={120} /></label>
                      <label>ایمیل<input name="email" type="email" dir="ltr" required maxLength={200} /></label>
                      <label>عنوان اصلی مدیر<select name="role" defaultValue="catalog_manager">
                        <option value="catalog_manager">مدیر محصولات و دسته‌ها</option>
                        <option value="content_manager">مدیر محتوا و بنرها</option>
                        <option value="order_manager">مدیر سفارش‌ها</option>
                        <option value="seller_manager">مدیر فروشندگان</option>
                      </select></label>
                      <fieldset className={styles.permissionGrid}>
                        <legend>دسترسی‌های این مدیر</legend>
                        {delegableAdminPermissions.map((permission) => (
                          <label key={permission}>
                            <input name="permissions" type="checkbox" value={permission} defaultChecked={permission === "catalog.write"} />
                            {adminPermissionLabels[permission]}
                          </label>
                        ))}
                      </fieldset>
                      <button type="submit">افزودن مدیر</button>
                    </form>
                    <div className={styles.campaignList}>
                      {state.adminUsers.length === 0 ? <p>هنوز مدیر دیگری اضافه نشده است.</p> : null}
                      {state.adminUsers.map((user) => (
                        <div className={styles.adminUserCard} key={user.id}>
                          <span><strong>{user.displayName}</strong><small dir="ltr">{user.email}</small><small>{adminRoleLabels[user.role]}</small></span>
                          <label><input type="checkbox" checked={user.active} onChange={() => void commit({ ...state, adminUsers: state.adminUsers.map((item) => item.id === user.id ? { ...item, active: !item.active } : item) })} /> فعال</label>
                          <fieldset className={styles.permissionGrid}>
                            <legend>سطح دسترسی</legend>
                            {delegableAdminPermissions.map((permission) => (
                              <label key={permission}>
                                <input
                                  type="checkbox"
                                  checked={user.permissions.includes(permission)}
                                  onChange={() => void commit({
                                    ...state,
                                    adminUsers: state.adminUsers.map((item) => item.id === user.id
                                      ? {
                                          ...item,
                                          permissions: item.permissions.includes(permission)
                                            ? item.permissions.filter((value) => value !== permission)
                                            : [...item.permissions, permission],
                                        }
                                      : item),
                                  })}
                                />
                                {adminPermissionLabels[permission]}
                              </label>
                            ))}
                          </fieldset>
                          <button className={styles.dangerButton} type="button" onClick={() => void commit({ ...state, adminUsers: state.adminUsers.filter((item) => item.id !== user.id) })}>حذف دسترسی</button>
                        </div>
                      ))}
                    </div>
                  </article>
                ) : null}
                {can("backup.read") ? (
                  <article className={styles.card}>
                    <h2>پشتیبان‌گیری و بازگردانی</h2>
                    <p>پیش از هر ذخیره، یک نسخهٔ قابل بازگردانی نگهداری می‌شود. حداکثر ۵۰ نسخهٔ اخیر حفظ می‌شود.</p>
                    <a className={styles.previewProductButton} href="/api/admin/backup">دانلود پشتیبان کامل JSON</a>
                    {role === "owner" ? (
                      <>
                        <a className={styles.previewProductButton} href="/api/admin/media-backup">دانلود پشتیبان کامل رسانه</a>
                        <p>این فایل ممکن است شامل تصاویر، مدارک فروشندگان و فیش‌های پرداخت باشد؛ آن را خصوصی نگهداری کنید.</p>
                      </>
                    ) : null}
                    <div className={styles.campaignList}>
                      {revisions.length === 0 ? <p>هنوز نسخهٔ قبلی ثبت نشده است.</p> : null}
                      {revisions.slice(0, 10).map((revision) => (
                        <div key={revision.id}>
                          <span><strong>{formatCalendarDateTime(revision.createdAt, calendarMode)}</strong><small dir="ltr">{revision.actorEmail}</small></span>
                          <button type="button" onClick={() => void restoreRevision(revision.id)}>بازگردانی این نسخه</button>
                        </div>
                      ))}
                    </div>
                  </article>
                ) : null}
              </section>
            ) : null}

            {tab === "content" || tab === "categories" || tab === "banners" ? (
              <section className={`${styles.stack} ${styles.contentPanel}`} data-mode={tab} aria-labelledby="content-title">
                <Heading kicker="Storefront CMS" id="content-title">
                  {tab === "categories"
                    ? "مدیریت دسته‌ها و برندها"
                    : tab === "banners"
                      ? "مدیریت بنرها"
                      : "محتوا و نمایش فروشگاه"}
                </Heading>
                <article className={`${styles.card} ${styles.contentOnly}`}>
                  <h2>نام و لوگوی فروشگاه</h2>
                  <p>لوگو در سربرگ و پایین فروشگاه نمایش داده می‌شود؛ اگر لوگو حذف شود، نام فروشگاه جای آن را می‌گیرد.</p>
                  <form className={styles.brandingForm} onSubmit={saveBranding}>
                    <label>نام فروشگاه<input name="siteName" required maxLength={80} defaultValue={state.branding.siteName} /></label>
                    <label>متن جایگزین لوگو<input name="logoAlt" maxLength={120} defaultValue={state.branding.logoAlt} /></label>
                    <label>فایل لوگو<input name="logo" type="file" accept="image/jpeg,image/png,image/webp,image/avif" /></label>
                    {state.branding.logoUrl ? (
                      <div className={styles.logoPreview}>
                        <img src={state.branding.logoUrl} alt={state.branding.logoAlt} />
                        <label><input name="removeLogo" type="checkbox" /> حذف لوگوی فعلی</label>
                      </div>
                    ) : null}
                    <small>برای لوگو، PNG یا WebP با پس‌زمینه شفاف مناسب‌تر است؛ حداکثر ۳ مگابایت.</small>
                    <button type="submit" disabled={brandingBusy}>{brandingBusy ? "در حال ذخیره…" : "ذخیره نام و لوگو"}</button>
                  </form>
                </article>
                <article className={`${styles.card} ${styles.contentOnly}`}>
                  <h2>نمایش بخش‌های صفحهٔ اصلی</h2>
                  <p>هر بخش فقط با تصمیم مدیر نمایش یا مخفی می‌شود.</p>
                  <div className={styles.toggleGrid}>
                    {Object.entries(adminSectionLabels).map(([key, label]) => (
                      <label key={key}>
                        <input
                          type="checkbox"
                          checked={state.sections[key as AdminSectionKey]}
                          onChange={() => toggleSection(key as AdminSectionKey)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </article>

                <article className={`${styles.card} ${styles.categoryOnly}`}>
                  <h2>دسته‌بندی مادر و زیرمجموعه‌ها</h2>
                  <p>دسته‌های آمادهٔ سیستم حذف نمی‌شوند، اما دسته‌های ساخته‌شده توسط مالک در صورت نداشتن محصول یا زیردستهٔ وابسته قابل حذف هستند.</p>
                  <form id="category-editor" key={editingCategory?.id ?? `new-category-${newCategoryParentSlug || "root"}`} className={styles.categoryForm} onSubmit={saveCategory}>
                    <h3>
                      {editingCategory
                        ? "ویرایش دسته‌بندی"
                        : newCategoryParentSlug
                          ? `افزودن زیر‌دسته به ${categoryPathLabel(newCategoryParentSlug)}`
                          : "افزودن دستهٔ مادر جدید"}
                    </h3>
                    <label>نام فارسی<input name="name" required maxLength={120} defaultValue={editingCategory?.name} /></label>
                    <label>نامک انگلیسی<input name="slug" required readOnly={editingCategory?.system} pattern="[A-Za-z0-9-]+" dir="ltr" placeholder="example-category" defaultValue={editingCategory?.slug} /></label>
                    <label>توضیح کوتاه<textarea name="description" maxLength={500} rows={3} defaultValue={editingCategory?.description} /></label>
                    <label>دستهٔ مادر / جایگاه
                      <select name="parentSlug" defaultValue={editingCategory?.parentSlug ?? newCategoryParentSlug}>
                        <option value="">دستهٔ مادر جدید</option>
                        {orderedRootCategories.filter((category) => category.slug !== editingCategory?.slug).map((category) => (
                          <option key={category.slug} value={category.slug}>زیرمجموعهٔ {category.name}</option>
                        ))}
                      </select>
                    </label>
                    <small>برای ساخت «تنباکو»، گزینهٔ «زیرمجموعهٔ دخانیات» را انتخاب کنید.</small>
                    <label>تصویر دسته‌بندی<input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/avif" /></label>
                    {editingCategory?.imageUrl ? (
                      <div className={styles.bannerImagePreview}>
                        <img src={editingCategory.imageUrl} alt={editingCategory.name} />
                        <label><input name="removeImage" type="checkbox" /> حذف تصویر بارگذاری‌شده</label>
                      </div>
                    ) : null}
                    {editingCategory?.system ? <label><input name="hideDefaultImage" type="checkbox" defaultChecked={editingCategory.imageHidden} /> حذف تصویر پیش‌فرض دسته</label> : null}
                    <small>تصویر مربع یا عمودی، حداکثر ۳ مگابایت. در صفحهٔ اصلی با قاب گرد نمایش داده می‌شود.</small>
                    <button type="submit" disabled={categoryBusy}>{categoryBusy ? "در حال ذخیره…" : editingCategory ? "ذخیره ویرایش" : "افزودن دسته‌بندی"}</button>
                    {(editingCategory || newCategoryParentSlug) ? <button type="button" onClick={cancelCategoryEdit}>لغو</button> : null}
                  </form>
                  <div className={styles.categoryList}>
                    {orderedRootCategories.map((root, rootIndex) => (
                      <div className={styles.categoryTree} key={root.id}>
                        {[root, ...allManagedCategories.filter((category) => category.parentSlug === root.slug)].map((category) => {
                          const hidden = category.system
                            ? state.hiddenCategoryIds.includes(category.slug)
                            : !category.visible;
                          return (
                            <div key={category.id} data-child={Boolean(category.parentSlug)} data-hidden={hidden}>
                              <span>
                                <strong>{category.parentSlug ? "↳ " : ""}{category.name}</strong>
                                <small dir="ltr">/{category.slug}</small>
                                <small>{category.parentSlug ? `زیردستهٔ ${root.name}` : category.system ? "دستهٔ مادر آماده" : "دستهٔ مادر سفارشی"}</small>
                              </span>
                              {!category.parentSlug ? <button type="button" disabled={rootIndex === 0} onClick={() => moveCategory(category.slug, -1)}>بالاتر</button> : null}
                              {!category.parentSlug ? <button type="button" disabled={rootIndex === orderedRootCategories.length - 1} onClick={() => moveCategory(category.slug, 1)}>پایین‌تر</button> : null}
                              {!category.parentSlug ? <button type="button" onClick={() => beginNewSubcategory(category.slug)}>افزودن زیر‌دسته</button> : null}
                              {selectableCategories.some((item) => item.slug === category.slug) ? <button type="button" onClick={() => beginNewBrand(category.slug)}>افزودن برند</button> : null}
                              <button type="button" onClick={() => category.system ? toggleCategorySafely(category) : toggleCustomCategorySafely(category)}>{hidden ? "نمایش" : "مخفی‌کردن"}</button>
                              <button type="button" onClick={() => beginCategoryEdit(category.id)}>ویرایش</button>
                              {!category.system && can("catalog.delete") ? <button className={styles.dangerButton} type="button" onClick={() => deleteCustomCategorySafely(category)}>حذف</button> : null}
                              <a className={styles.listPreviewLink} href={`/category/${category.slug}`} target="_blank" rel="noreferrer">مشاهده صفحه</a>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </article>

                <article className={`${styles.card} ${styles.categoryOnly}`}>
                  <h2>برندهای هر دسته</h2>
                  <p>برند مستقل از دسته است، اما به یک شاخهٔ مشخص وصل می‌شود؛ نمونه: دخانیات ← تنباکو ← جلایر.</p>
                  <form id="brand-editor" key={editingBrand?.id ?? `new-brand-${newBrandCategorySlug || "unset"}`} className={styles.categoryForm} onSubmit={saveBrand}>
                    <h3>
                      {editingBrand
                        ? "ویرایش برند"
                        : newBrandCategorySlug
                          ? `افزودن برند به ${categoryPathLabel(newBrandCategorySlug)}`
                          : "افزودن برند"}
                    </h3>
                    <label>نام برند<input name="name" required maxLength={100} defaultValue={editingBrand?.name} placeholder="مثلاً جلایر" /></label>
                    <label>نامک انگلیسی<input name="slug" pattern="[A-Za-z0-9-]+" dir="ltr" placeholder="jellayer" defaultValue={editingBrand?.slug} /></label>
                    <label>دستهٔ مرتبط
                      <select name="categorySlug" required defaultValue={editingBrand?.categorySlug ?? newBrandCategorySlug}>
                        <option value="" disabled>انتخاب کنید</option>
                        {selectableCategories.map((category) => (
                          <option key={category.slug} value={category.slug}>{categoryPathLabel(category.slug)}</option>
                        ))}
                      </select>
                    </label>
                    <small>برای نظم بهتر، برند را به دقیق‌ترین زیردسته وصل کنید؛ مثلاً «جلایر» به «تنباکو».</small>
                    <button type="submit">{editingBrand ? "ذخیره ویرایش برند" : "افزودن برند"}</button>
                    {(editingBrand || newBrandCategorySlug) ? <button type="button" onClick={cancelBrandEdit}>لغو</button> : null}
                  </form>
                  <div className={styles.brandCatalog}>
                    {orderedRootCategories.map((root) => {
                      const categorySlugs = allManagedCategories
                        .filter((category) => isCategoryWithin(category.slug, root.slug))
                        .map((category) => category.slug);
                      const brands = state.brands.filter((brand) => categorySlugs.includes(brand.categorySlug));
                      if (brands.length === 0) return null;
                      return (
                        <section key={root.slug}>
                          <h3>{root.name}</h3>
                          {brands.map((brand) => (
                            <div key={brand.id}>
                              <span><strong>{brand.name}</strong><small>{categoryPathLabel(brand.categorySlug)}</small></span>
                              <button type="button" onClick={() => beginBrandEdit(brand.id)}>ویرایش</button>
                              {can("catalog.delete") ? <button className={styles.dangerButton} type="button" onClick={() => deleteBrandSafely(brand)}>حذف</button> : null}
                            </div>
                          ))}
                        </section>
                      );
                    })}
                  </div>
                </article>

                <article className={`${styles.card} ${styles.contentOnly}`}>
                  <h2>پیام بالای سایت</h2>
                  <p>پیام، رنگ زمینه، رنگ نوشته، لینک، ترتیب و زمان نمایش را کنترل کنید. همهٔ پیام‌های فعال کنار هم در نوار بالای سایت دیده می‌شوند.</p>
                  <form key={editingMessage?.id ?? "new-message"} className={styles.campaignForm} onSubmit={saveHeaderMessage}>
                    <label>متن پیام<input name="text" required maxLength={160} defaultValue={editingMessage?.text} /></label>
                    <label>لینک مقصد<input name="href" maxLength={300} placeholder="/offers" dir="ltr" defaultValue={editingMessage?.href} /></label>
                    <label>رنگ زمینه<input name="backgroundColor" type="color" defaultValue={editingMessage?.backgroundColor ?? "#4f46e5"} /></label>
                    <label>رنگ نوشته<input name="textColor" type="color" defaultValue={editingMessage?.textColor ?? "#ffffff"} /></label>
                    <fieldset className={styles.jalaliEditor}>
                      <legend>زمان‌بندی پیام ({calendarMode === "jalali" ? "شمسی" : "میلادی"}، اختیاری)</legend>
                      <CalendarDateTimeInput label="شروع" dateName="startsDate" timeName="startsTime" value={editingMessageStarts} mode={calendarMode} />
                      <CalendarDateTimeInput label="پایان" dateName="endsDate" timeName="endsTime" value={editingMessageEnds} mode={calendarMode} />
                    </fieldset>
                    <button type="submit">{editingMessage ? "ذخیره ویرایش پیام" : "افزودن پیام"}</button>
                    {editingMessage ? <button type="button" onClick={() => setEditingMessageId("")}>لغو ویرایش</button> : null}
                  </form>
                  <div className={styles.campaignList}>
                    {state.headerMessages.length === 0 ? <p>هیچ پیام بالای سایتی فعال نیست.</p> : null}
                    {state.headerMessages.map((message, index) => (
                      <div key={message.id}>
                        <span className={styles.messageSwatch} style={{ background: message.backgroundColor, color: message.textColor }}>{message.text}</span>
                        {message.startsAt || message.endsAt ? <small>{message.startsAt ? `شروع: ${formatCalendarDateTime(message.startsAt, calendarMode)}` : "شروع فوری"} · {message.endsAt ? `پایان: ${formatCalendarDateTime(message.endsAt, calendarMode)}` : "بدون پایان"}</small> : null}
                        <label>
                          <input
                            type="checkbox"
                            checked={message.visible}
                            onChange={() => void commit({
                              ...state,
                              headerMessages: state.headerMessages.map((item) =>
                                item.id === message.id ? { ...item, visible: !item.visible } : item,
                              ),
                            })}
                          />
                          نمایش
                        </label>
                        <button type="button" disabled={index === 0} onClick={() => void commit({ ...state, headerMessages: moveItem(state.headerMessages, message.id, -1) })}>بالاتر</button>
                        <button type="button" disabled={index === state.headerMessages.length - 1} onClick={() => void commit({ ...state, headerMessages: moveItem(state.headerMessages, message.id, 1) })}>پایین‌تر</button>
                        <button type="button" onClick={() => setEditingMessageId(message.id)}>ویرایش</button>
                        {can("content.delete") ? <button className={styles.dangerButton} type="button" onClick={() => {
                          if (window.confirm("این پیام حذف شود؟")) void commit({ ...state, headerMessages: state.headerMessages.filter((item) => item.id !== message.id) });
                        }}>حذف</button> : null}
                      </div>
                    ))}
                  </div>
                </article>

                <article className={`${styles.card} ${styles.contentOnly}`}>
                  <h2>چیدمان پیشنهاد شگفت‌انگیز</h2>
                  <p>عنوان، رنگ، محصولات، تعداد کارت‌ها، لینک صفحهٔ اختصاصی و تایمر بخش شگفت‌انگیز صفحهٔ اول را کنترل کنید. هر محصول فعال، خودکار در شگفت‌انگیز دستهٔ مادر خودش هم قرار می‌گیرد.</p>
                  <form key={`amazing-${state.amazingSection.endsAt}`} className={styles.campaignForm} onSubmit={saveAmazingSection}>
                    <label>عنوان بخش<input name="title" required maxLength={120} defaultValue={state.amazingSection.title} /></label>
                    <label>زیرعنوان<input name="subtitle" maxLength={180} defaultValue={state.amazingSection.subtitle} /></label>
                    <label>لینک «مشاهده همه»<input name="href" maxLength={300} dir="ltr" defaultValue={state.amazingSection.href} /></label>
                    <label>متن لینک<input name="linkLabel" maxLength={60} defaultValue={state.amazingSection.linkLabel} /></label>
                    <label>رنگ زمینه<input name="backgroundColor" type="color" defaultValue={state.amazingSection.backgroundColor} /></label>
                    <label>رنگ نوشته<input name="textColor" type="color" defaultValue={state.amazingSection.textColor} /></label>
                    <label>انتخاب محصولات
                      <select name="selectionMode" defaultValue={state.amazingSection.selectionMode}>
                        <option value="amazing">محصولات دارای تیک و زمان‌بندی فعال</option>
                        <option value="placement">محصولات جایگاه شگفت‌انگیز</option>
                        <option value="discounted">همه محصولات تخفیف‌دار</option>
                      </select>
                    </label>
                    <label>تعداد کارت در ردیف<input name="itemLimit" type="number" min="3" max="30" step="1" defaultValue={state.amazingSection.itemLimit} /></label>
                    <fieldset className={styles.jalaliEditor}>
                      <legend>پایان کلی بخش (اختیاری، {calendarMode === "jalali" ? "شمسی" : "میلادی"})</legend>
                      <CalendarDateTimeInput label="پایان" dateName="endsDate" timeName="endsTime" value={amazingSectionEnds} mode={calendarMode} />
                    </fieldset>
                    <label><input name="showTimer" type="checkbox" defaultChecked={state.amazingSection.showTimer} /> نمایش شمارش معکوس</label>
                    <button type="submit">ذخیره تنظیمات شگفت‌انگیز</button>
                  </form>
                </article>

                <article className={`${styles.card} ${styles.bannerOnly}`}>
                  <h2>بنرهای تبلیغاتی</h2>
                  <p>هر تعداد بنر موردنیاز، با تصویر جداگانهٔ دسکتاپ و موبایل، مقصد کلیک، اندازه، ترتیب و زمان کمپین قابل مدیریت است. بنرهای تمام‌عرض فعال به‌صورت خودکار جابه‌جا می‌شوند.</p>
                  <form key={editingBanner?.id ?? "new-banner"} className={styles.campaignForm} onSubmit={saveBanner}>
                    <label>نام داخلی بنر<input name="title" required maxLength={160} defaultValue={editingBanner?.title} /></label>
                    <label>توضیح تصویر<input name="altText" required maxLength={180} defaultValue={editingBanner?.altText} /></label>
                    <label>لینک مقصد<input name="href" maxLength={300} placeholder="/offers" dir="ltr" defaultValue={editingBanner?.href} /></label>
                    <label>اندازه بنر<select name="placement" defaultValue={editingBanner?.placement ?? "wide"}><option value="wide">تمام‌عرض</option><option value="half">نیم‌عرض</option></select></label>
                    <label>محل نمایش
                      <select name="scope" defaultValue={editingBanner?.scope ?? "home"}>
                        <option value="home">صفحهٔ اصلی</option>
                        <option value="category">صفحهٔ یک دستهٔ مادر</option>
                      </select>
                    </label>
                    <label>دستهٔ مادر بنر
                      <select name="categorySlug" defaultValue={editingBanner?.categorySlug ?? ""}>
                        <option value="">برای صفحهٔ اصلی لازم نیست</option>
                        {orderedRootCategories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
                      </select>
                    </label>
                    <label>تصویر اصلی (دسکتاپ)<input name="desktopImage" type="file" accept="image/jpeg,image/png,image/webp,image/avif" /></label>
                    <label>تصویر موبایل (اختیاری)<input name="mobileImage" type="file" accept="image/jpeg,image/png,image/webp,image/avif" /></label>
                    <fieldset className={styles.jalaliEditor}>
                      <legend>زمان‌بندی بنر ({calendarMode === "jalali" ? "شمسی" : "میلادی"}، اختیاری)</legend>
                      <CalendarDateTimeInput label="شروع" dateName="startsDate" timeName="startsTime" value={editingBannerStarts} mode={calendarMode} />
                      <CalendarDateTimeInput label="پایان" dateName="endsDate" timeName="endsTime" value={editingBannerEnds} mode={calendarMode} />
                    </fieldset>
                    {editingBanner?.desktopImageUrl ? <div className={styles.bannerImagePreview}><img src={editingBanner.desktopImageUrl} alt={editingBanner.altText} /><label><input name="removeDesktopImage" type="checkbox" /> حذف تصویر اصلی</label></div> : null}
                    {editingBanner?.mobileImageUrl ? <div className={styles.bannerImagePreview}><img src={editingBanner.mobileImageUrl} alt="" /><label><input name="removeMobileImage" type="checkbox" /> حذف تصویر موبایل</label></div> : null}
                    <small>تصویر اصلی تا ۵ مگابایت. پیشنهاد: تمام‌عرض ۱۲۰۰×۴۰۰ و نیم‌عرض ۶۰۰×۳۰۰ پیکسل.</small>
                    <button type="submit" disabled={bannerBusy}>{bannerBusy ? "در حال بارگذاری…" : editingBanner ? "ذخیره ویرایش بنر" : "افزودن بنر"}</button>
                    {editingBanner ? <button type="button" onClick={() => setEditingBannerId("")}>لغو ویرایش</button> : null}
                  </form>
                  <div className={styles.bannerAdminList}>
                    {state.banners.length === 0 ? <p>هنوز بنری ساخته نشده است.</p> : null}
                    {state.banners.map((banner, index) => (
                      <div key={banner.id}>
                        {banner.desktopImageUrl ? <img src={banner.desktopImageUrl} alt={banner.altText} /> : <span className={styles.emptyBanner}>بدون تصویر</span>}
                        <span><strong>{banner.title}</strong><small>{banner.placement === "wide" ? "تمام‌عرض" : "نیم‌عرض"} · {banner.scope === "category" ? `دستهٔ ${categoryPathLabel(banner.categorySlug)}` : "صفحهٔ اصلی"}</small>{banner.startsAt || banner.endsAt ? <small>{banner.startsAt ? `شروع: ${formatCalendarDateTime(banner.startsAt, calendarMode)}` : "شروع فوری"} · {banner.endsAt ? `پایان: ${formatCalendarDateTime(banner.endsAt, calendarMode)}` : "بدون پایان"}</small> : null}</span>
                        <label>
                          <input
                            type="checkbox"
                            checked={banner.visible}
                            onChange={() => void commit({
                              ...state,
                              banners: state.banners.map((item) =>
                                item.id === banner.id ? { ...item, visible: !item.visible } : item,
                              ),
                            })}
                          />
                          نمایش
                        </label>
                        <button type="button" disabled={index === 0} onClick={() => void commit({ ...state, banners: moveItem(state.banners, banner.id, -1) })}>بالاتر</button>
                        <button type="button" disabled={index === state.banners.length - 1} onClick={() => void commit({ ...state, banners: moveItem(state.banners, banner.id, 1) })}>پایین‌تر</button>
                        <button type="button" onClick={() => setEditingBannerId(banner.id)}>ویرایش</button>
                        {can("content.delete") ? <button className={styles.dangerButton} type="button" onClick={() => {
                          if (window.confirm(`بنر «${banner.title}» حذف شود؟`)) void commit({ ...state, banners: state.banners.filter((item) => item.id !== banner.id) });
                        }}>حذف</button> : null}
                      </div>
                    ))}
                  </div>
                </article>
              </section>
            ) : null}

            {tab === "products" ? (
              <section className={styles.productSection} aria-labelledby="products-title">
                <Heading kicker="Catalog" id="products-title">مدیریت محصولات</Heading>
                <div className={styles.productWorkspace}>
                  <form
                    id="product-editor"
                    key={`${editingProduct?.id ?? "new"}-${productEditorVersion}`}
                    className={styles.productForm}
                    onSubmit={addProduct}
                    onInputCapture={(event) => {
                      const control = event.target;
                      if (
                        (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) &&
                        control.checkValidity()
                      ) {
                        control.removeAttribute("aria-invalid");
                        if (
                          activeProductValidation?.fieldName === control.name &&
                          activeProductValidation.message === statusMessage &&
                          saveStatus === "error"
                        ) {
                          setActiveProductValidation(null);
                          setStatusMessage("");
                          setSaveStatus("idle");
                        }
                      }
                    }}
                    noValidate
                  >
                    <div className={styles.productEditorHeading}>
                      <h2>{editingProduct ? "ویرایش محصول" : "محصول جدید"}</h2>
                      {editingProduct ? (
                        <button
                          className={styles.variantQuickAction}
                          type="button"
                          onClick={() => productVariantsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                        >
                          رفتن به تنوع‌ها ({editingProduct.variants.length.toLocaleString("fa-IR")})
                        </button>
                      ) : null}
                    </div>
                    <label>عنوان فارسی<input name="title" required maxLength={180} defaultValue={editingProduct?.title} /></label>
                    <label>عنوان انگلیسی (اختیاری)<input name="englishTitle" maxLength={180} dir="ltr" defaultValue={editingProduct?.englishTitle ?? ""} /></label>
                    <label>نامک انگلیسی<input name="slug" required pattern="[A-Za-z0-9-]+" dir="ltr" defaultValue={editingProduct?.slug} /></label>
                    <label>کد کالا (SKU)<input name="sku" required maxLength={80} dir="ltr" defaultValue={editingProduct?.sku} /></label>
                    <label>دسته‌بندی
                      <select
                        name="category"
                        required
                        value={productCategorySelection}
                        onChange={(event) => {
                          const nextCategory = event.currentTarget.value;
                          const selectedManagedBrand = state.brands.find(
                            (brand) => brand.name === productBrandSelection,
                          );
                          const changedFromPersisted = nextCategory !== editingProduct?.category;
                          if (
                            (selectedManagedBrand && !isCategoryWithin(nextCategory, selectedManagedBrand.categorySlug)) ||
                            (!selectedManagedBrand && productBrandSelection && changedFromPersisted)
                          ) {
                            setProductBrandSelection("");
                          }
                          setProductCategorySelection(nextCategory);
                        }}
                      >
                        <option value="" disabled>انتخاب کنید</option>
                        {selectableCategories.map((category) => <option key={category.slug} value={category.slug}>{categoryPathLabel(category.slug)}</option>)}
                      </select>
                    </label>
                    <label>برند
                      <select
                        name="brand"
                        required
                        disabled={!productCategorySelection}
                        value={productBrandSelection}
                        onChange={(event) => setProductBrandSelection(event.currentTarget.value)}
                      >
                        <option value="" disabled>{productCategorySelection ? "برند مرتبط را انتخاب کنید" : "ابتدا دسته‌بندی را انتخاب کنید"}</option>
                        {editingProduct?.brand && !availableProductBrands.some((brand) => brand.name === editingProduct.brand) && productCategorySelection === editingProduct.category ? (
                          <option value={editingProduct.brand}>{editingProduct.brand} · برند قدیمی</option>
                        ) : null}
                        {availableProductBrands.map((brand) => (
                          <option key={brand.id} value={brand.name}>{brand.name} · {categoryPathLabel(brand.categorySlug)}</option>
                        ))}
                      </select>
                    </label>
                    <label>جایگاه نمایش
                      <select name="placement" defaultValue={editingProduct?.placement ?? "special-offers"}>
                        <option value="special-offers">پیشنهاد شگفت‌انگیز</option>
                        <option value="digital-picks">منتخب دیجیتال</option>
                        <option value="home-picks">برای خانه</option>
                        <option value="trending">محبوب‌ها</option>
                      </select>
                    </label>
                    <label>توضیح کوتاه (اختیاری)<textarea name="shortDescription" maxLength={500} rows={2} defaultValue={editingProduct?.shortDescription ?? ""} /></label>
                    <label>توضیح کامل<textarea name="description" maxLength={2000} rows={4} defaultValue={editingProduct?.description} /></label>
                    <fieldset className={styles.priceEditor}>
                      <legend>ویژگی‌های ساختاریافته محصول</legend>
                      <p>هر ویژگی یک تعریف واحد دارد و برای مشخصات فنی، ویژگی‌های کلیدی، فیلتر، جست‌وجو و مقایسه استفاده می‌شود.</p>
                      {(editingProduct?.attributes ?? []).map((attribute) => (
                        <article key={attribute.id} className={styles.commerceRow}>
                          <strong>{attribute.label}</strong>
                          <small><span dir="ltr">{attribute.code}</span> · {attribute.dataType === "number" ? "عددی" : attribute.dataType === "boolean" ? "بله/خیر" : "متنی"}{attribute.unit ? ` · ${attribute.unit}` : ""}</small>
                          <label>مقدار<AttributeValueInput name={`attributeValue-${attribute.id}`} dataType={attribute.dataType} defaultValue={attribute.value} /></label>
                          <label><input name={`attributeKey-${attribute.id}`} type="checkbox" defaultChecked={attribute.keyFeature} /> ویژگی کلیدی</label>
                          <label><input name={`attributeDelete-${attribute.id}`} type="checkbox" /> بایگانی مقدار</label>
                          <small>{[attribute.filterable ? "فیلتر" : "", attribute.searchable ? "جست‌وجو" : "", attribute.comparable ? "مقایسه" : ""].filter(Boolean).join(" · ") || "فقط نمایش مشخصات"}</small>
                        </article>
                      ))}
                      <article className={styles.commerceRow}>
                        <strong>افزودن ویژگی جدید</strong>
                        <label>عنوان فارسی<input name="newProductAttributeLabel" maxLength={100} placeholder="مثلاً وزن" /></label>
                        <label>کد انگلیسی<input name="newProductAttributeCode" dir="ltr" maxLength={80} pattern="[A-Za-z0-9_]+" placeholder="weight" /></label>
                        <label>نوع داده<select name="newProductAttributeDataType" defaultValue="text"><option value="text">متنی</option><option value="number">عددی</option><option value="boolean">بله/خیر</option></select></label>
                        <label>مقدار<input name="newProductAttributeValue" maxLength={500} placeholder="برای بله/خیر: true یا false" /></label>
                        <label>واحد (اختیاری)<input name="newProductAttributeUnit" maxLength={40} placeholder="مثلاً گرم" /></label>
                        <label><input name="newProductAttributeKey" type="checkbox" /> ویژگی کلیدی</label>
                        <label><input name="newProductAttributeFilterable" type="checkbox" /> قابل فیلتر</label>
                        <label><input name="newProductAttributeSearchable" type="checkbox" /> قابل جست‌وجو</label>
                        <label><input name="newProductAttributeComparable" type="checkbox" /> قابل مقایسه</label>
                      </article>
                    </fieldset>
                    <fieldset className={styles.priceEditor}>
                      <legend>قیمت‌گذاری محصول</legend>
                      <p>قیمت پایه و تخفیف هر محصول مستقل است. مبالغ در پایگاه‌داده به ریال ذخیره و در فروشگاه به تومان و ریال نمایش داده می‌شوند.</p>
                      <label>واحد ورود قیمت
                        <select name="priceUnit" defaultValue="toman">
                          <option value="toman">تومان</option>
                          <option value="rial">ریال</option>
                        </select>
                      </label>
                      <label>قیمت پایه<input name="basePrice" type="number" min="0" step="1" required defaultValue={editingProduct ? rialToPriceInput(editingProduct.compareAtPriceMinor > editingProduct.priceMinor ? editingProduct.compareAtPriceMinor : editingProduct.priceMinor, "toman") : undefined} /></label>
                      <label>نوع تخفیف
                        <select name="discountType" defaultValue={editingProduct?.discountType ?? "none"}>
                          <option value="none">بدون تخفیف</option>
                          <option value="percentage">درصدی</option>
                          <option value="amount">مبلغ ثابت</option>
                        </select>
                      </label>
                      <label>مقدار تخفیف<input name="discountValue" type="number" min="0" step="1" defaultValue={editingProduct?.discountType === "percentage" ? editingProduct.discountValue : editingProduct?.discountType === "amount" ? rialToPriceInput(editingProduct.discountValue, "toman") : 0} /></label>
                      <label>واحد تخفیف ثابت
                        <select name="discountUnit" defaultValue="toman">
                          <option value="toman">تومان</option>
                          <option value="rial">ریال</option>
                        </select>
                      </label>
                      <small>در حالت درصدی، مقدار تخفیف بین ۰ تا ۱۰۰ است. در حالت مبلغ ثابت، واحد انتخابی اعمال می‌شود.</small>
                      {editingProduct ? <small>قیمت نهایی فعلی: {formatMoney(editingProduct.priceMinor, IRAN_CURRENCY)} ({formatRialReference(editingProduct.priceMinor)})</small> : null}
                    </fieldset>
                    <fieldset ref={productVariantsRef} id="product-variants" className={styles.priceEditor}>
                      <legend>تنوع‌های محصول ({(editingProduct?.variants.length ?? 0).toLocaleString("fa-IR")})</legend>
                      <p>برای رنگ، سایز یا مدل‌های مختلف، SKU، قیمت و موجودی مستقل تعریف کنید. اگر تنوعی ندارید این بخش را خالی بگذارید.</p>
                      {(editingProduct?.variants.length ?? 0) === 0 ? <p className={styles.variantEmptyState}>این محصول تنوعی ندارد.</p> : null}
                      {(editingProduct?.variants ?? []).map((variant) => (
                        <article key={variant.id} className={`${styles.commerceRow} ${styles.variantCard}`}>
                          <header className={styles.variantCardHeader}>
                            <span>
                              <strong>{variant.title}</strong>
                              <small dir="ltr">SKU: {variant.sku}</small>
                              <small className={styles.variantReservation} data-reserved={variant.reservedQuantity > 0}>
                                {variant.reservedQuantity > 0
                                  ? "رزرو فعال — حذف ممکن نیست"
                                  : "بدون رزرو فعال"}
                              </small>
                            </span>
                            {can("catalog.delete") ? (
                              <button
                                className={styles.dangerButton}
                                type="button"
                                disabled={productBusy || variant.reservedQuantity > 0}
                                onClick={() => void deleteProductVariant(editingProduct!.id, variant.id)}
                              >
                                حذف تنوع
                              </button>
                            ) : null}
                          </header>
                          <label>عنوان<input name={`variantTitle-${variant.id}`} defaultValue={variant.title} maxLength={120} /></label>
                          <label>SKU<input name={`variantSku-${variant.id}`} defaultValue={variant.sku} dir="ltr" maxLength={80} /></label>
                          <label>قیمت<input name={`variantPrice-${variant.id}`} type="number" min="0" defaultValue={rialToPriceInput(variant.priceMinor, "toman")} /></label>
                          <label>قیمت قبل تخفیف<input name={`variantCompareAt-${variant.id}`} type="number" min="0" defaultValue={rialToPriceInput(variant.compareAtPriceMinor, "toman")} /></label>
                          <label>موجودی<input name={`variantStock-${variant.id}`} type="number" min={variant.reservedQuantity} max="1000000" defaultValue={variant.stockQuantity} /></label>
                          <label><input name={`variantVisible-${variant.id}`} type="checkbox" defaultChecked={variant.visible} /> نمایش</label>
                          {(variant.attributes ?? []).map((attribute) => (
                            <label key={attribute.id}>{attribute.label} <small dir="ltr">{attribute.code}</small>
                              <AttributeValueInput name={`variantAttributeValue-${attribute.id}`} dataType={attribute.dataType} defaultValue={attribute.value} />
                              <span><input name={`variantAttributeDelete-${attribute.id}`} type="checkbox" /> بایگانی مقدار</span>
                            </label>
                          ))}
                          <label>عنوان ویژگی جدید<input name={`newVariantAttribute-${variant.id}Label`} maxLength={100} /></label>
                          <label>کد ویژگی جدید<input name={`newVariantAttribute-${variant.id}Code`} dir="ltr" maxLength={80} pattern="[A-Za-z0-9_]+" /></label>
                          <label>نوع ویژگی جدید<select name={`newVariantAttribute-${variant.id}DataType`} defaultValue="text"><option value="text">متنی</option><option value="number">عددی</option><option value="boolean">بله/خیر</option></select></label>
                          <label>مقدار ویژگی جدید<input name={`newVariantAttribute-${variant.id}Value`} maxLength={500} /></label>
                          <label>واحد<input name={`newVariantAttribute-${variant.id}Unit`} maxLength={40} /></label>
                          <label><input name={`newVariantAttribute-${variant.id}Filterable`} type="checkbox" /> فیلتر</label>
                          <label><input name={`newVariantAttribute-${variant.id}Searchable`} type="checkbox" /> جست‌وجو</label>
                          <label><input name={`newVariantAttribute-${variant.id}Comparable`} type="checkbox" /> مقایسه</label>
                        </article>
                      ))}
                      <article className={styles.commerceRow}>
                        <strong>افزودن تنوع جدید</strong>
                        <label>عنوان<input name="newVariantTitle" maxLength={120} placeholder="مثلاً مشکی / ۲۵۶ گیگ" /></label>
                        <label>SKU<input name="newVariantSku" dir="ltr" maxLength={80} /></label>
                        <label>قیمت<input name="newVariantPrice" type="number" min="0" /></label>
                        <label>قیمت قبل تخفیف<input name="newVariantCompareAt" type="number" min="0" /></label>
                        <label>موجودی<input name="newVariantStock" type="number" min="0" max="1000000" /></label>
                        <label>عنوان ویژگی تنوع<input name="newVariantAttributeLabel" maxLength={100} placeholder="مثلاً طعم" /></label>
                        <label>کد ویژگی تنوع<input name="newVariantAttributeCode" dir="ltr" maxLength={80} pattern="[A-Za-z0-9_]+" placeholder="flavor" /></label>
                        <label>نوع ویژگی<select name="newVariantAttributeDataType" defaultValue="text"><option value="text">متنی</option><option value="number">عددی</option><option value="boolean">بله/خیر</option></select></label>
                        <label>مقدار ویژگی<input name="newVariantAttributeValue" maxLength={500} placeholder="مثلاً نعنا" /></label>
                        <label>واحد<input name="newVariantAttributeUnit" maxLength={40} /></label>
                        <label><input name="newVariantAttributeFilterable" type="checkbox" /> فیلتر</label>
                        <label><input name="newVariantAttributeSearchable" type="checkbox" /> جست‌وجو</label>
                        <label><input name="newVariantAttributeComparable" type="checkbox" /> مقایسه</label>
                      </article>
                    </fieldset>
                    {can("security.write") ? (
                      <fieldset className={styles.priceEditor}>
                        <legend>پیشنهاد فروشندگان تأییدشده</legend>
                        <p>هر فروشنده قیمت، موجودی، ضمانت و روش ارسال مستقل دارد. فقط فروشندگان کاملاً تأییدشده قابل فعال‌سازی‌اند.</p>
                        {eligibleSellers.length === 0 ? <small>هنوز فروشنده‌ای با مدارک، ضمانت و قرارداد کاملاً تأییدشده وجود ندارد.</small> : null}
                        {eligibleSellers.map((seller) => {
                          const offer = editingProduct?.sellerOffers.find((item) => item.sellerId === seller.id);
                          return (
                            <article key={seller.id} className={styles.commerceRow}>
                              <label><input name={`sellerEnabled-${seller.id}`} type="checkbox" defaultChecked={Boolean(offer?.visible)} /> {seller.storeName}</label>
                              <label>قیمت<input name={`sellerPrice-${seller.id}`} type="number" min="0" defaultValue={offer ? rialToPriceInput(offer.priceMinor, "toman") : 0} /></label>
                              <label>موجودی<input name={`sellerStock-${seller.id}`} type="number" min={offer?.reservedQuantity ?? 0} max="1000000" defaultValue={offer?.stockQuantity ?? 0} /></label>
                              <label>ضمانت<input name={`sellerGuarantee-${seller.id}`} maxLength={160} defaultValue={offer?.guaranteeLabel ?? ""} /></label>
                              <label>ارسال<input name={`sellerDelivery-${seller.id}`} maxLength={160} defaultValue={offer?.deliveryLabel ?? ""} /></label>
                              {offer ? <small>رزروشده: {offer.reservedQuantity.toLocaleString("fa-IR")}</small> : null}
                            </article>
                          );
                        })}
                      </fieldset>
                    ) : null}
                    <fieldset className={styles.amazingEditor}>
                      <legend>پیشنهاد شگفت‌انگیز</legend>
                      <label><input name="amazingEnabled" type="checkbox" defaultChecked={editingProduct?.amazingEnabled} /> فعال‌کردن شگفت‌انگیز برای این محصول</label>
                      <div>
                        <CalendarDateTimeInput label="شروع" dateName="amazingStartsDate" timeName="amazingStartsTime" value={editingProductAmazingStarts} mode={calendarMode} />
                        <CalendarDateTimeInput label="پایان" dateName="amazingEndsDate" timeName="amazingEndsTime" value={editingProductAmazingEnds} mode={calendarMode} />
                      </div>
                      <small>تاریخ‌ها با تقویم انتخابی مالک و ساعت ایران نمایش داده می‌شوند؛ تایمر پس از پایان خودکار غیرفعال خواهد شد.</small>
                    </fieldset>
                    <label>موجودی کل<input name="stockQuantity" type="number" min={editingProduct?.reservedQuantity ?? 0} max="1000000" step="1" required defaultValue={editingProduct?.stockQuantity ?? 0} /></label>
                    {(editingProduct?.imageUrls.length ?? 0) + selectedProductImages.length > 0 ? (
                      <fieldset className={styles.galleryEditor}>
                        <legend>گالری محصول</legend>
                        <p>از میان تصاویر فعلی و جدید دقیقاً یک عکس اصلی انتخاب کنید. حذف‌ها فقط پس از ذخیره اعمال می‌شوند.</p>
                        <div>
                          {(editingProduct?.imageUrls ?? []).map((url, index) => {
                            const removed = removedProductImages.includes(url);
                            return (
                            <article key={url} data-removed={removed}>
                              <img src={url} alt={`${editingProduct?.title ?? "محصول"} - ${index + 1}`} />
                              <small>ذخیره‌شده</small>
                              <label><input type="radio" name="primaryImage" value={url} checked={primaryProductImage === url} disabled={removed} onChange={() => setPrimaryProductImage(url)} /> عکس اصلی</label>
                              <label><input type="checkbox" checked={removed} onChange={(event) => {
                                const willRemove = event.currentTarget.checked;
                                const nextRemoved = willRemove
                                  ? [...removedProductImages, url]
                                  : removedProductImages.filter((item) => item !== url);
                                setRemovedProductImages(nextRemoved);
                                if (willRemove && primaryProductImage === url) {
                                  const fallbackExisting = editingProduct?.imageUrls.find((item) => item !== url && !nextRemoved.includes(item));
                                  setPrimaryProductImage(fallbackExisting ?? (selectedProductImages[0] ? `new:${selectedProductImages[0].key}` : ""));
                                } else if (!willRemove && !primaryProductImage) {
                                  setPrimaryProductImage(url);
                                }
                              }} /> حذف هنگام ذخیره</label>
                            </article>
                          )})}
                          {selectedProductImages.map((item) => (
                            <article key={item.key}>
                              <img src={item.previewUrl} alt={item.file.name} />
                              <strong>جدید / هنوز ذخیره نشده</strong>
                              <small>{item.file.name} · {(item.file.size / 1024 / 1024).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} مگابایت</small>
                              <label><input type="radio" name="primaryImage" value={`new:${item.key}`} checked={primaryProductImage === `new:${item.key}`} onChange={() => setPrimaryProductImage(`new:${item.key}`)} /> عکس اصلی</label>
                              <button type="button" onClick={() => {
                                revokeProductPreview(item.previewUrl);
                                const remaining = selectedProductImages.filter((selected) => selected.key !== item.key);
                                setSelectedProductImages(remaining);
                                if (primaryProductImage === `new:${item.key}`) {
                                  const fallbackExisting = editingProduct?.imageUrls.find((url) => !removedProductImages.includes(url));
                                  setPrimaryProductImage(fallbackExisting ?? (remaining[0] ? `new:${remaining[0].key}` : ""));
                                }
                              }}>برداشتن از انتخاب</button>
                            </article>
                          ))}
                        </div>
                      </fieldset>
                    ) : null}
                    <label>
                      تصاویر محصول
                      <input
                        key={`product-images-${productMediaInputVersion}`}
                        name="productImages"
                        type="file"
                        multiple
                        accept={PRODUCT_IMAGE_ACCEPT}
                        onChange={(event) => {
                          const files = Array.from(event.currentTarget.files ?? []);
                          const invalidFile = files.find((file) => getProductImageValidationError(file));
                          if (invalidFile) {
                            reportProductValidation(
                              event.currentTarget.form!,
                              "productImages",
                              getProductImageValidationError(invalidFile),
                            );
                            event.currentTarget.value = "";
                            return;
                          }
                          const selectedKeys = new Set(selectedProductImages.map((item) => item.key));
                          const uniqueFiles = files.filter((file) => {
                            const key = productImageFileIdentity(file);
                            if (selectedKeys.has(key)) return false;
                            selectedKeys.add(key);
                            return true;
                          });
                          const remainingExistingCount = (editingProduct?.imageUrls ?? []).filter(
                            (url) => !removedProductImages.includes(url),
                          ).length;
                          if (remainingExistingCount + selectedProductImages.length + uniqueFiles.length > MAX_PRODUCT_IMAGES) {
                            reportProductValidation(
                              event.currentTarget.form!,
                              "productImages",
                              "برای هر محصول حداکثر ۱۰ تصویر مجاز است.",
                            );
                            event.currentTarget.value = "";
                            return;
                          }
                          const staged = uniqueFiles.map((file) => {
                            const previewUrl = URL.createObjectURL(file);
                            productPreviewUrls.current.add(previewUrl);
                            return { key: productImageFileIdentity(file), file, previewUrl };
                          });
                          setSelectedProductImages((current) => [...current, ...staged]);
                          if (!primaryProductImage && staged[0]) setPrimaryProductImage(`new:${staged[0].key}`);
                          setSaveStatus("idle");
                          setStatusMessage("");
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <small>تا ۱۰ تصویر؛ انتخاب‌های بعدی به گالری اضافه می‌شوند. JPG، PNG، WebP و AVIF مستقیماً پشتیبانی می‌شوند؛ HEIC/HEIF در مرورگر سازگار تبدیل می‌شود.</small>
                    {selectedProductImages.length ? (
                      <button type="button" onClick={() => {
                          for (const item of selectedProductImages) revokeProductPreview(item.previewUrl);
                          setSelectedProductImages([]);
                          const fallbackExisting = editingProduct?.imageUrls.find((url) => !removedProductImages.includes(url));
                          if (primaryProductImage.startsWith("new:")) setPrimaryProductImage(fallbackExisting ?? "");
                          setProductMediaInputVersion((version) => version + 1);
                        }}>پاک کردن تصاویر جدید</button>
                    ) : null}
                    {editingProduct?.videoUrl ? (
                      <div className={styles.videoEditor}>
                        <video src={editingProduct.videoUrl} controls preload="metadata" />
                        <label><input type="checkbox" checked={removeExistingProductVideo} onChange={(event) => setRemoveExistingProductVideo(event.currentTarget.checked)} /> حذف ویدئوی فعلی هنگام ذخیره</label>
                      </div>
                    ) : null}
                    <label>
                      ویدئوی کوتاه محصول
                      <input
                        key={`product-video-${productMediaInputVersion}`}
                        name="productVideo"
                        type="file"
                        accept="video/mp4,video/webm"
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          if (!file) return;
                          if (file.size <= 0 || file.size > 25_000_000 || !new Set(["video/mp4", "video/webm"]).has(file.type)) {
                            reportProductValidation(
                              event.currentTarget.form!,
                              "productVideo",
                              "ویدئو باید MP4 یا WebM و حداکثر ۲۵ مگابایت باشد.",
                            );
                            event.currentTarget.value = "";
                            return;
                          }
                          if (selectedProductVideo) revokeProductPreview(selectedProductVideo.previewUrl);
                          const previewUrl = URL.createObjectURL(file);
                          productPreviewUrls.current.add(previewUrl);
                          setSelectedProductVideo({ file, previewUrl });
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <small>یک کلیپ MP4 یا WebM تا ۲۵ مگابایت؛ بهتر است کوتاه و بدون اطلاعات شخصی باشد.</small>
                    {selectedProductVideo ? (
                      <div className={styles.selectedMediaList} aria-live="polite">
                        <strong>{editingProduct?.videoUrl ? "ویدئوی جایگزین؛ هنوز ذخیره نشده" : "ویدئوی جدید؛ هنوز ذخیره نشده"}</strong>
                        <video src={selectedProductVideo.previewUrl} controls preload="metadata" />
                        <div>
                          <span>{selectedProductVideo.file.name}<small>{(selectedProductVideo.file.size / 1024 / 1024).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} مگابایت</small></span>
                          <button type="button" onClick={() => {
                            revokeProductPreview(selectedProductVideo.previewUrl);
                            setSelectedProductVideo(null);
                            setProductMediaInputVersion((version) => version + 1);
                          }}>برداشتن از انتخاب</button>
                        </div>
                      </div>
                    ) : null}
                    <button type="submit" disabled={productBusy}>{productBusy ? "در حال ذخیره…" : editingProduct ? "ذخیره ویرایش" : "افزودن محصول"}</button>
                    {lastSavedProductSlug && editingProduct?.slug === lastSavedProductSlug ? (
                      <a className={styles.previewProductButton} href={`/product/${lastSavedProductSlug}`} target="_blank" rel="noreferrer">مشاهده همین محصول در فروشگاه ↗</a>
                    ) : null}
                    {editingProduct ? <button type="button" onClick={cancelProductEdit}>لغو ویرایش</button> : null}
                  </form>
                  <div className={styles.productList}>
                    <div className={styles.productListHeader}>
                      <h2>محصولات هر دسته</h2>
                      <nav className={styles.productCategoryFilter} aria-label="انتخاب دستهٔ محصولات">
                        {orderedRootCategories.map((category) => (
                          <button
                            key={category.slug}
                            type="button"
                            data-active={activeProductCategoryFilter === category.slug}
                            onClick={() => setProductCategoryFilter(category.slug)}
                          >
                            {category.name}
                          </button>
                        ))}
                      </nav>
                      {activeFilterChildren.length > 0 ? (
                        <div className={styles.productSubcategoryFilter}>
                          {activeFilterChildren.map((category) => (
                            <button key={category.slug} type="button" data-active={activeProductCategoryFilter === category.slug} onClick={() => setProductCategoryFilter(category.slug)}>
                              {category.name}
                            </button>
                          ))}
                        </div>
                      ) : allManagedCategories.find((category) => category.slug === activeProductCategoryFilter)?.parentSlug ? (
                        <button
                          className={styles.backToParentFilter}
                          type="button"
                          onClick={() => setProductCategoryFilter(
                            allManagedCategories.find((category) => category.slug === activeProductCategoryFilter)?.parentSlug ?? "",
                          )}
                        >
                          بازگشت به دستهٔ مادر
                        </button>
                      ) : null}
                      <p>
                        {categoryPathLabel(activeProductCategoryFilter)} · {filteredAdminProducts.length.toLocaleString("fa-IR")} محصول
                      </p>
                    </div>
                    <div className={styles.productListBody}>
                      {filteredAdminProducts.length === 0 ? <p>در این دسته هنوز محصولی ثبت نشده است.</p> : null}
                      {groupedAdminProducts.map((categoryGroup) => (
                        <section key={categoryGroup.categorySlug} className={styles.productCategoryGroup}>
                          <h3>{categoryPathLabel(categoryGroup.categorySlug)}</h3>
                          {categoryGroup.brands.map(([brandLabel, products]) => (
                            <section key={brandLabel} className={styles.productBrandGroup}>
                              <h4>{brandLabel} <small>{products.length.toLocaleString("fa-IR")} محصول</small></h4>
                              {products.map((product) => (
                                <article key={product.id}>
                                  {product.imageUrls[0] ? <img src={product.imageUrls[0]} alt={product.title} /> : <span>بدون تصویر</span>}
                                  <div><strong>{product.title}</strong><small>{product.brand} · {categoryPathLabel(product.category)} · SKU: {product.sku}</small><small>{formatAdminMoney(product.priceMinor, product.currency)} · {product.imageUrls.length.toLocaleString("fa-IR")} تصویر{product.videoUrl ? " · دارای ویدئو" : ""}{product.amazingEnabled ? " · زمان‌بندی شگفت‌انگیز" : ""} · موجود: {(product.stockQuantity - product.reservedQuantity).toLocaleString("fa-IR")} · رزرو: {product.reservedQuantity.toLocaleString("fa-IR")}</small>{product.amazingEnabled ? <small>شگفت‌انگیز: {formatCalendarDateTime(product.amazingStartsAt, calendarMode)} تا {formatCalendarDateTime(product.amazingEndsAt, calendarMode)}</small> : null}</div>
                                  <label>
                                    <input
                                      type="checkbox"
                                      checked={product.visible}
                                      onChange={() => void commit({
                                        ...state,
                                        products: state.products.map((item) => item.id === product.id ? { ...item, visible: !item.visible } : item),
                                      })}
                                    />
                                    نمایش
                                  </label>
                                  <button type="button" onClick={() => beginProductEdit(product.id)}>ویرایش</button>
                                  <a className={styles.listPreviewLink} href={`/product/${product.slug}`} target="_blank" rel="noreferrer">مشاهده</a>
                                  {can("catalog.delete") ? (
                                    <button
                                      className={styles.dangerButton}
                                      type="button"
                                      disabled={productBusy}
                                      onClick={() => void deleteProduct(product.id, product.title)}
                                    >
                                      حذف
                                    </button>
                                  ) : null}
                                </article>
                              ))}
                            </section>
                          ))}
                        </section>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {tab === "orders" ? (
              <section aria-labelledby="orders-title">
                <Heading kicker="Orders" id="orders-title">مدیریت سفارش‌ها</Heading>
                <div className={styles.sellerWorkspace}>
                  <div className={styles.sellerList}>
                    {orders.length === 0 ? <p>هنوز سفارشی ثبت نشده است.</p> : null}
                    {orders.map((order) => (
                      <button key={order.id} type="button" data-active={order.id === selectedOrder?.id} onClick={() => setSelectedOrderId(order.id)}>
                        <strong dir="ltr">{order.orderNumber}</strong>
                        <span>{order.customerName} · {orderStatusLabels[order.status]}</span>
                      </button>
                    ))}
                  </div>
                  <article className={styles.sellerDetail}>
                    {selectedOrder ? (
                      <>
                        <div className={styles.orderDetailHeading}>
                          <h2 dir="ltr">{selectedOrder.orderNumber}</h2>
                          {can("orders.delete") ? (
                            <button
                              className={styles.dangerButton}
                              type="button"
                              disabled={orderBusy}
                              onClick={() => void deleteOrder(selectedOrder)}
                            >
                              {orderBusy ? "در حال حذف…" : "حذف کامل سفارش"}
                            </button>
                          ) : null}
                        </div>
                        <dl>
                          <div><dt>مشتری</dt><dd>{selectedOrder.customerName}</dd></div>
                          <div><dt>ایمیل</dt><dd dir="ltr">{selectedOrder.customerEmail}</dd></div>
                          <div><dt>تماس</dt><dd dir="ltr">{selectedOrder.customerPhone}</dd></div>
                          <div><dt>نشانی</dt><dd>{selectedOrder.addressLabel ? `${selectedOrder.addressLabel} · ` : ""}{selectedOrder.addressLine}، {selectedOrder.province ? `${selectedOrder.province}، ` : ""}{selectedOrder.city}{selectedOrder.postcode ? `، ${selectedOrder.postcode}` : ""}</dd></div>
                          <div><dt>تحویل</dt><dd>{deliveryLabels[selectedOrder.deliveryMethod]}</dd></div>
                          <div><dt>پرداخت</dt><dd>{paymentStatusLabels[selectedOrder.paymentStatus]}</dd></div>
                          {selectedOrder.reservationExpiresAt ? <div><dt>پایان رزرو</dt><dd>{formatCalendarDateTime(selectedOrder.reservationExpiresAt, calendarMode)}</dd></div> : null}
                          <div><dt>زمان ثبت</dt><dd>{formatCalendarDateTime(selectedOrder.createdAt, calendarMode)}</dd></div>
                          <div><dt>آخرین تغییر</dt><dd>{formatCalendarDateTime(selectedOrder.updatedAt, calendarMode)}</dd></div>
                          <div><dt>جمع سفارش</dt><dd>{formatAdminMoney(selectedOrder.totalMinor, selectedOrder.currency)}</dd></div>
                        </dl>
                        <h3>فیش کارت‌به‌کارت</h3>
                        {selectedOrderReceipt ? (
                          <div className={styles.receiptReview}>
                            <dl>
                              <div><dt>وضعیت فیش</dt><dd>{selectedOrderReceipt.status === "pending" ? "در انتظار بررسی" : selectedOrderReceipt.status === "approved" ? "تأییدشده" : "ردشده"}</dd></div>
                              <div><dt>زمان ارسال</dt><dd>{formatCalendarDateTime(selectedOrderReceipt.createdAt, calendarMode)}</dd></div>
                              <div><dt>نام فایل</dt><dd>{selectedOrderReceipt.originalName}</dd></div>
                              {selectedOrderReceipt.transferReference ? <div><dt>شماره پیگیری مشتری</dt><dd dir="ltr">{selectedOrderReceipt.transferReference}</dd></div> : null}
                              {selectedOrderReceipt.customerNote ? <div><dt>یادداشت مشتری</dt><dd>{selectedOrderReceipt.customerNote}</dd></div> : null}
                              {selectedOrderReceipt.reviewedBy ? <div><dt>بررسی‌کننده</dt><dd dir="ltr">{selectedOrderReceipt.reviewedBy}</dd></div> : null}
                              {selectedOrderReceipt.reviewNote ? <div><dt>یادداشت بررسی</dt><dd>{selectedOrderReceipt.reviewNote}</dd></div> : null}
                            </dl>
                            <a href={`/api/admin/bank-transfer-receipts/file?id=${encodeURIComponent(selectedOrderReceipt.id)}`} target="_blank" rel="noreferrer">مشاهده فایل فیش</a>
                            {selectedOrderReceipt.status === "pending" ? (
                              <>
                                <label>یادداشت بررسی<textarea value={receiptReviewNote} maxLength={500} rows={3} onChange={(event) => setReceiptReviewNote(event.target.value)} /></label>
                                <p>قبل از تأیید، واریز را در حساب بانکی کنترل کنید. تصویر فیش به‌تنهایی مدرک قطعی واریز نیست.</p>
                                <div className={styles.receiptActions}>
                                  <button type="button" disabled={receiptBusy} onClick={() => void reviewReceipt("approved")}>تأیید و ثبت پرداخت</button>
                                  <button className={styles.dangerButton} type="button" disabled={receiptBusy} onClick={() => void reviewReceipt("rejected")}>رد فیش</button>
                                </div>
                              </>
                            ) : null}
                          </div>
                        ) : <p>برای این سفارش فیشی ارسال نشده است.</p>}
                        <h3>اقلام سفارش</h3>
                        <ul>
                          {selectedOrder.items.map((item) => <li key={item.id}>{item.title}{item.selectionLabel ? ` — ${item.selectionLabel}` : ""} × {item.quantity.toLocaleString("fa-IR")} — {formatAdminMoney(item.lineTotalMinor, selectedOrder.currency)}</li>)}
                        </ul>
                        <label>وضعیت
                          <select
                            value={selectedOrder.status}
                            disabled={nextOrderStatuses[selectedOrder.status].length === 0}
                            onChange={(event) => void updateOrder(selectedOrder, event.target.value as OrderStatus)}
                          >
                            <option value={selectedOrder.status}>{orderStatusLabels[selectedOrder.status]}</option>
                            {nextOrderStatuses[selectedOrder.status].map((status) => <option key={status} value={status}>{orderStatusLabels[status]}</option>)}
                          </select>
                        </label>
                      </>
                    ) : <p>یک سفارش را انتخاب کنید.</p>}
                  </article>
                </div>
              </section>
            ) : null}

            {tab === "customers" ? (
              <>
                {can("customers.read") ? <CustomerDirectoryPanel calendarMode={calendarMode} canDelete={can("customers.delete")} /> : null}
                {can("support.write") || can("reviews.write") ? (
                  <CustomerCarePanel
                    calendarMode={calendarMode}
                    canSupport={can("support.write")}
                    canReviews={can("reviews.write")}
                    canDeleteSupport={can("support.delete")}
                    canDeleteReviews={can("reviews.delete")}
                  />
                ) : null}
              </>
            ) : null}

            {tab === "reports" ? (
              <AdminReportsPanel calendarMode={calendarMode} />
            ) : null}

            {tab === "sellers" ? (
              <section aria-labelledby="sellers-title">
                <Heading kicker="Marketplace" id="sellers-title">پرونده و احراز هویت فروشندگان</Heading>
                <div className={styles.sellerProcessStats}>
                  <Stat label="درخواست‌های جدید" value={sellers.filter((seller) => seller.status === "new").length} />
                  <Stat label="مدارک تأییدشده" value={sellers.filter((seller) => seller.documentStatus === "verified").length} />
                  <Stat label="ضمانت تکمیل‌شده" value={sellers.filter((seller) => seller.guaranteeStatus === "verified" || seller.guaranteeStatus === "waived").length} />
                  <Stat label="فروشندگان کاملاً تأییدشده" value={eligibleSellers.length} />
                </div>
                <div className={styles.sellerWorkspace}>
                  <div className={styles.sellerList}>
                    {sellers.length === 0 ? <p>هنوز درخواستی ثبت نشده است.</p> : null}
                    {sellers.map((seller) => (
                      <button key={seller.id} type="button" data-active={seller.id === selectedSeller?.id} onClick={() => setSelectedSellerId(seller.id)}>
                        <strong>{seller.storeName}</strong>
                        <span>{seller.contactName} · {sellerStatusLabels[seller.status]}</span>
                      </button>
                    ))}
                  </div>
                  <article className={styles.sellerDetail}>
                    {selectedSeller ? (
                      <>
                        <h2>{selectedSeller.storeName}</h2>
                        <div className={styles.verificationSteps}>
                          <span data-done={selectedSeller.documentStatus === "verified"}>۱. مدارک</span>
                          <span data-done={selectedSeller.guaranteeStatus === "verified" || selectedSeller.guaranteeStatus === "waived"}>۲. ضمانت</span>
                          <span data-done={selectedSeller.agreementStatus === "signed"}>۳. قرارداد</span>
                          <span data-done={selectedSeller.status === "approved"}>۴. تأیید</span>
                        </div>
                        <dl>
                          <div><dt>مسئول</dt><dd>{selectedSeller.contactName}</dd></div>
                          <div><dt>ایمیل</dt><dd dir="ltr">{selectedSeller.email}</dd></div>
                          <div><dt>تماس</dt><dd dir="ltr">{selectedSeller.phone}</dd></div>
                          <div><dt>دسته</dt><dd>{selectedSeller.category}</dd></div>
                          <div><dt>نوع</dt><dd>{sellerLegalTypeLabels[selectedSeller.legalType]}</dd></div>
                          <div><dt>مبلغ ضمانت</dt><dd>{formatAdminMoney(selectedSeller.guaranteeAmountMinor)}</dd></div>
                          <div><dt>شناسه</dt><dd dir="ltr">{selectedSeller.registrationNumber || "ثبت نشده"}</dd></div>
                          <div><dt>نشانی</dt><dd>{selectedSeller.address}</dd></div>
                          <div><dt>تاریخ درخواست</dt><dd>{formatCalendarDateTime(selectedSeller.createdAt, calendarMode)}</dd></div>
                        </dl>
                        <p>{selectedSeller.notes || "بدون توضیحات"}</p>
                        <section className={styles.sellerDocuments} aria-labelledby="seller-documents-title">
                          <h3 id="seller-documents-title">مدارک خصوصی پرونده</h3>
                          {selectedSeller.documents.length === 0 ? <p>مدرکی بارگذاری نشده است.</p> : (
                            <ul>
                              {selectedSeller.documents.map((document) => (
                                <li key={document.id}>
                                  <span>{document.name} · {(document.size / 1_000_000).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} MB</span>
                                  <a href={document.downloadUrl} target="_blank" rel="noreferrer">مشاهده امن</a>
                                </li>
                              ))}
                            </ul>
                          )}
                        </section>
                        <form key={selectedSeller.id} className={styles.sellerReviewForm} onSubmit={saveSellerReview}>
                          <h3>ویرایش اطلاعات فروشنده</h3>
                          <label>نام فروشگاه<input name="storeName" required maxLength={120} defaultValue={selectedSeller.storeName} /></label>
                          <label>نام مسئول<input name="contactName" required maxLength={120} defaultValue={selectedSeller.contactName} /></label>
                          <label>ایمیل<input name="email" type="email" dir="ltr" required maxLength={200} defaultValue={selectedSeller.email} /></label>
                          <label>شماره تماس<input name="phone" dir="ltr" required maxLength={40} defaultValue={selectedSeller.phone} /></label>
                          <label>دسته فعالیت
                            <select name="category" defaultValue={selectedSeller.category}>
                              {selectableCategories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
                            </select>
                          </label>
                          <label>نوع فروشنده
                            <select name="legalType" defaultValue={selectedSeller.legalType}>
                              {Object.entries(sellerLegalTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </label>
                          <label>شناسه ثبت<input name="registrationNumber" maxLength={120} defaultValue={selectedSeller.registrationNumber} /></label>
                          <label className={styles.fullWidth}>نشانی<textarea name="address" required rows={3} maxLength={500} defaultValue={selectedSeller.address} /></label>
                          <label className={styles.fullWidth}>توضیحات فروشنده<textarea name="notes" rows={3} maxLength={1000} defaultValue={selectedSeller.notes} /></label>
                          <h3>کنترل مراحل تأیید</h3>
                          <label>وضعیت مدارک
                            <select name="documentStatus" defaultValue={selectedSeller.documentStatus}>
                              {Object.entries(sellerDocumentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </label>
                          <label>نوع ضمانت
                            <select name="guaranteeType" defaultValue={selectedSeller.guaranteeType}>
                              {Object.entries(sellerGuaranteeTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </label>
                          <label>واحد مبلغ ضمانت
                            <select name="guaranteeUnit" defaultValue="toman"><option value="toman">تومان</option><option value="rial">ریال</option></select>
                          </label>
                          <label>مبلغ ضمانت
                            <input name="guaranteeAmount" type="number" min="0" step="1" defaultValue={rialToPriceInput(selectedSeller.guaranteeAmountMinor, "toman")} />
                          </label>
                          <label>وضعیت ضمانت
                            <select name="guaranteeStatus" defaultValue={selectedSeller.guaranteeStatus}>
                              {Object.entries(sellerGuaranteeStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </label>
                          <label>وضعیت قرارداد
                            <select name="agreementStatus" defaultValue={selectedSeller.agreementStatus}>
                              {Object.entries(sellerAgreementStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </label>
                          <label>نتیجه پرونده
                            <select name="status" defaultValue={selectedSeller.status}>
                              {Object.entries(sellerStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </label>
                          <label className={styles.fullWidth}>یادداشت داخلی مدیر
                            <textarea name="adminNotes" rows={4} maxLength={2000} defaultValue={selectedSeller.adminNotes} />
                          </label>
                          <p className={styles.approvalGuard} data-ready={canApproveSeller(selectedSeller)}>
                            {canApproveSeller(selectedSeller)
                              ? "پرونده شرایط تأیید نهایی را دارد."
                              : "تأیید نهایی قفل است تا مدارک، ضمانت و قرارداد کامل شوند."}
                          </p>
                          <button type="submit" disabled={sellerBusy}>{sellerBusy ? "در حال ذخیره…" : "ذخیره بررسی پرونده"}</button>
                          {can("sellers.delete") ? (
                            <button className={styles.dangerButton} type="button" disabled={sellerBusy} onClick={() => void deleteSeller(selectedSeller)}>
                              حذف کامل فروشنده
                            </button>
                          ) : null}
                        </form>
                      </>
                    ) : <p>یک درخواست را انتخاب کنید.</p>}
                  </article>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </Container>
    </main>
  );
}

function Heading({ kicker, id, children }: { kicker: string; id: string; children: string }) {
  return <div className={styles.heading}><p>{kicker}</p><h1 id={id}>{children}</h1></div>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <article><span>{label}</span><strong>{value.toLocaleString("fa-IR")}</strong></article>;
}

function formatAdminMoney(
  amountMinor: number,
  currency: string = IRAN_CURRENCY,
) {
  const amountRial = normalizeLegacyPriceToRial(amountMinor, currency);
  return `${formatMoney(amountRial, IRAN_CURRENCY)} (${formatRialReference(amountRial)})`;
}
