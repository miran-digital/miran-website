import type { AdminState } from "../features/admin/admin-types.ts";
import type { StoreOrder } from "../features/orders/order-types.ts";
import type { SellerApplication } from "../features/seller/seller-types.ts";
import { canApproveSeller } from "../features/seller/seller-types.ts";
import { IRAN_CURRENCY } from "./money.ts";
import { isBankTransferConfigured } from "./bank-transfer.ts";

export type LaunchReadinessStatus = "ready" | "warning" | "blocker";
export type LaunchReadinessAction =
  | "overview"
  | "content"
  | "products"
  | "orders"
  | "sellers";

export type LaunchReadinessCheck = {
  id: string;
  label: string;
  status: LaunchReadinessStatus;
  detail: string;
  actionTab?: LaunchReadinessAction;
};

export type LaunchReadinessReport = {
  generatedAt: string;
  readyCount: number;
  warningCount: number;
  blockerCount: number;
  checks: LaunchReadinessCheck[];
};

export function buildLaunchReadiness(input: {
  state: AdminState;
  sellers: readonly SellerApplication[];
  orders: readonly StoreOrder[];
  paymentEnabled: boolean;
  siteUrl: string;
  siteIndexable: boolean;
  now?: number;
}): LaunchReadinessReport {
  const now = input.now ?? Date.now();
  const products = input.state.products.filter((product) => product.visible);
  const incompleteProducts = products.filter(
    (product) =>
      !product.title.trim() ||
      !product.slug.trim() ||
      !product.sku.trim() ||
      product.priceMinor <= 0 ||
      product.imageUrls.length === 0,
  );
  const purchasableProducts = products.filter((product) =>
    product.stockQuantity - product.reservedQuantity > 0 ||
    product.variants.some(
      (variant) =>
        variant.visible &&
        variant.stockQuantity - variant.reservedQuantity > 0,
    ) ||
    product.sellerOffers.some(
      (offer) =>
        offer.visible && offer.stockQuantity - offer.reservedQuantity > 0,
    ),
  );
  const nonIranProducts = products.filter(
    (product) => product.currency !== IRAN_CURRENCY,
  );
  const legacyOrders = input.orders.filter(
    (order) => order.currency !== IRAN_CURRENCY,
  );
  const invalidApprovedSellers = input.sellers.filter(
    (seller) => seller.status === "approved" && !canApproveSeller(seller),
  );
  const activeAmazing = products.filter((product) =>
    isAmazingActive(product, now),
  );
  const primaryDomainReady = isPrimaryDomain(input.siteUrl);
  const bankTransferEnabled = Boolean(
    input.state.commerce?.bankTransfer &&
      isBankTransferConfigured(input.state.commerce.bankTransfer),
  );

  const checks: LaunchReadinessCheck[] = [
    products.length === 0
      ? {
          id: "catalog",
          label: "کاتالوگ قابل فروش",
          status: "blocker",
          detail: "هیچ محصول قابل نمایشی وجود ندارد.",
          actionTab: "products",
        }
      : incompleteProducts.length > 0
        ? {
            id: "catalog",
            label: "کاتالوگ قابل فروش",
            status: "blocker",
            detail: `${incompleteProducts.length.toLocaleString("fa-IR")} محصول قیمت، تصویر، SKU یا نامک کامل ندارد.`,
            actionTab: "products",
          }
        : {
            id: "catalog",
            label: "کاتالوگ قابل فروش",
            status: "ready",
            detail: `${products.length.toLocaleString("fa-IR")} محصول قابل نمایش، قیمت‌گذاری و تصویربرداری شده است.`,
          },
    purchasableProducts.length === 0
      ? {
          id: "inventory",
          label: "موجودی قابل سفارش",
          status: "blocker",
          detail: "هیچ محصولی موجودی آزاد برای ثبت سفارش ندارد.",
          actionTab: "products",
        }
      : {
          id: "inventory",
          label: "موجودی قابل سفارش",
          status: "ready",
          detail: `${purchasableProducts.length.toLocaleString("fa-IR")} محصول موجودی آزاد دارد.`,
        },
    nonIranProducts.length > 0
      ? {
          id: "currency",
          label: "یکپارچگی ریال و تومان",
          status: "blocker",
          detail: `${nonIranProducts.length.toLocaleString("fa-IR")} محصول هنوز با واحد غیرایرانی ذخیره شده است.`,
          actionTab: "products",
        }
      : legacyOrders.length > 0
        ? {
            id: "currency",
            label: "یکپارچگی ریال و تومان",
            status: "warning",
            detail: `کالاهای جاری ریالی‌اند؛ ${legacyOrders.length.toLocaleString("fa-IR")} سفارش آزمایشی قدیمی فقط در تاریخچه واحد قبلی دارد.`,
            actionTab: "orders",
          }
        : {
            id: "currency",
            label: "یکپارچگی ریال و تومان",
            status: "ready",
            detail: "کالاها و سفارش‌ها فقط با دفتر ریالی کار می‌کنند و در سایت تومان/ریال نمایش داده می‌شوند.",
          },
    input.paymentEnabled || bankTransferEnabled
      ? {
          id: "payment",
          label: "پرداخت واقعی",
          status: "ready",
          detail: input.paymentEnabled && bankTransferEnabled
            ? "زرین‌پال و کارت‌به‌کارت با بررسی مدیریتی فعال‌اند."
            : input.paymentEnabled
              ? "درگاه زرین‌پال برای تراکنش واقعی پیکربندی شده است."
              : "کارت‌به‌کارت با ارسال فیش و تأیید دستی مدیریت فعال است.",
        }
      : {
          id: "payment",
          label: "پرداخت واقعی",
          status: "blocker",
          detail: "نه شناسهٔ پذیرندهٔ زرین‌پال ثبت شده و نه کارت‌به‌کارت توسط مالک فعال است.",
          actionTab: "overview",
        },
    primaryDomainReady
      ? {
          id: "domain",
          label: "دامنهٔ اصلی",
          status: "ready",
          detail: "آدرس اصلی فروشگاه روی almiran.ir تنظیم شده است.",
        }
      : {
          id: "domain",
          label: "دامنهٔ اصلی",
          status: "blocker",
          detail: "آدرس اصلی سایت با دامنهٔ almiran.ir هم‌خوان نیست.",
          actionTab: "overview",
        },
    input.siteIndexable
      ? {
          id: "seo-index",
          label: "ورود به نتایج جست‌وجو",
          status: "ready",
          detail: "اجازهٔ ایندکس عمومی برای موتورهای جست‌وجو فعال است.",
        }
      : {
          id: "seo-index",
          label: "ورود به نتایج جست‌وجو",
          status: "warning",
          detail: "ایندکس عمومی عمداً تا تکمیل پرداخت و داده‌های واقعی بسته است.",
          actionTab: "overview",
        },
    invalidApprovedSellers.length > 0
      ? {
          id: "seller-verification",
          label: "احراز فروشندگان",
          status: "blocker",
          detail: `${invalidApprovedSellers.length.toLocaleString("fa-IR")} فروشندهٔ قدیمی با وجود نقص مدارک یا ضمانت تأییدشده علامت خورده است.`,
          actionTab: "sellers",
        }
      : {
          id: "seller-verification",
          label: "احراز فروشندگان",
          status: "ready",
          detail: "هیچ فروشندهٔ تأییدشدهٔ ناسازگار با قواعد احراز وجود ندارد.",
        },
    activeAmazing.length > 0
      ? {
          id: "amazing",
          label: "پیشنهاد شگفت‌انگیز فعال",
          status: "ready",
          detail: `${activeAmazing.length.toLocaleString("fa-IR")} محصول دارای بازهٔ زمانی معتبر است.`,
        }
      : {
          id: "amazing",
          label: "پیشنهاد شگفت‌انگیز فعال",
          status: "warning",
          detail: "در حال حاضر هیچ محصولی داخل بازهٔ زمانی شگفت‌انگیز نیست.",
          actionTab: "products",
        },
  ];

  return {
    generatedAt: new Date(now).toISOString(),
    readyCount: checks.filter((check) => check.status === "ready").length,
    warningCount: checks.filter((check) => check.status === "warning").length,
    blockerCount: checks.filter((check) => check.status === "blocker").length,
    checks,
  };
}

function isAmazingActive(
  product: AdminState["products"][number],
  now: number,
) {
  if (!product.amazingEnabled) return false;
  const startsAt = Date.parse(product.amazingStartsAt);
  const endsAt = Date.parse(product.amazingEndsAt);
  return Number.isFinite(startsAt) &&
    Number.isFinite(endsAt) &&
    startsAt <= now &&
    endsAt >= now;
}

function isPrimaryDomain(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "almiran.ir" || url.hostname === "www.almiran.ir");
  } catch {
    return false;
  }
}
