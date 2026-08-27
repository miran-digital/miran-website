import { getCustomerUser } from "@/lib/customer-auth";
import { getOwnedCustomerAddress } from "@/db/customer-address-repository";
import { createOrderRecord, type ValidatedOrderLine } from "@/db/order-repository";
import { readStorefrontState } from "@/db/admin-repository";
import { getCatalogProduct } from "@/features/catalog/catalog-data";
import type { DeliveryMethod } from "@/features/orders/order-types";
import { rejectCrossSiteMutation } from "@/lib/request-security";
import { getDeliveryPriceMinor, IRAN_CURRENCY } from "@/lib/money";
import { rejectRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type OrderPayload = {
  idempotencyKey?: unknown;
  website?: unknown;
  addressId?: unknown;
  deliveryMethod?: unknown;
  lines?: unknown;
};

const MAX_JSON_BYTES = 32_768;
const INVALID_JSON = Symbol("invalid-json");
const JSON_TOO_LARGE = Symbol("json-too-large");

export async function POST(request: Request) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;

  const user = await getCustomerUser();
  if (!user || !isEmail(user.email)) {
    return privateJson({ error: "برای ثبت سفارش وارد حساب شوید." }, 401);
  }
  const rateLimited = await rejectRateLimited(request, {
    scope: "order.create",
    identity: user.email,
    limit: 8,
    windowSeconds: 600,
  });
  if (rateLimited) return rateLimited;

  const payload = await readBoundedJson(request) as
    | OrderPayload
    | typeof INVALID_JSON
    | typeof JSON_TOO_LARGE;
  if (payload === JSON_TOO_LARGE) {
    return privateJson({ error: "حجم درخواست سفارش بیش از حد مجاز است." }, 413);
  }
  if (payload === INVALID_JSON || !payload || typeof payload !== "object") {
    return invalid();
  }
  if (typeof payload.website === "string" && payload.website.trim()) {
    return privateJson({ error: "درخواست نامعتبر است." }, 400);
  }

  const idempotencyKey = clean(payload.idempotencyKey, 120);
  const addressId = clean(payload.addressId, 120);
  const deliveryMethod = payload.deliveryMethod as DeliveryMethod;
  if (
    !idempotencyKey ||
    !isUuid(idempotencyKey) ||
    !isUuid(addressId) ||
    !["standard", "priority"].includes(deliveryMethod)
  ) {
    return invalid();
  }

  if (!Array.isArray(payload.lines) || payload.lines.length < 1 || payload.lines.length > 30) {
    return invalid();
  }

  try {
    const address = await getOwnedCustomerAddress(user.email, addressId);
    if (!address) {
      return privateJson(
        { error: "نشانی انتخاب‌شده در حساب شما پیدا نشد." },
        404,
      );
    }
    const storefront = await readStorefrontState();
    const lines: ValidatedOrderLine[] = [];
    let currency = "";
    let totalQuantity = 0;
    for (const raw of payload.lines) {
      if (!raw || typeof raw !== "object") return invalid();
      const line = raw as Record<string, unknown>;
      const productId = clean(line.productId, 120);
      const slug = clean(line.slug, 180);
      const variantId = clean(line.variantId, 120);
      const sellerOfferId = clean(line.sellerOfferId, 120);
      const quantity = Number(line.quantity);
      if (
        !productId ||
        !slug ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > 10
      ) {
        return invalid();
      }
      if (variantId && sellerOfferId) return invalid();
      const product = await getCatalogProduct(slug);
      if (!product || product.id !== productId || !product.inStock) {
        return Response.json(
          { error: "یکی از کالاها دیگر قابل سفارش نیست؛ سبد را بازبینی کنید." },
          { status: 409 },
        );
      }
      const variant = variantId
        ? product.variants.find((item) => item.id === variantId)
        : undefined;
      const sellerOffer = sellerOfferId
        ? product.sellerOffers.find((item) => item.id === sellerOfferId)
        : undefined;
      if ((variantId && !variant) || (sellerOfferId && !sellerOffer)) {
        return Response.json(
          { error: "گزینهٔ انتخاب‌شده برای این کالا دیگر در دسترس نیست." },
          { status: 409 },
        );
      }
      const availableQuantity =
        variant?.availableQuantity ??
        sellerOffer?.availableQuantity ??
        product.availableQuantity;
      if (availableQuantity !== undefined && quantity > availableQuantity) {
        return Response.json(
          { error: `موجودی «${product.title}» برای این تعداد کافی نیست.` },
          { status: 409 },
        );
      }
      const selectedPrice = variant?.price ?? sellerOffer?.price ?? product.price;
      if (selectedPrice.currency !== IRAN_CURRENCY) {
        return privateJson(
          { error: "ثبت سفارش جدید فقط با قیمت ریالی مجاز است." },
          409,
        );
      }
      if (currency && selectedPrice.currency !== currency) {
        return privateJson(
          { error: "قیمت کالاهای این سفارش باید با واحد پول ایران هماهنگ باشد." },
          409,
        );
      }
      currency = selectedPrice.currency;
      totalQuantity += quantity;
      lines.push({
        productId: product.id,
        variantId,
        sellerOfferId,
        selectionLabel:
          variant?.title ??
          (sellerOffer ? `فروشنده: ${sellerOffer.sellerName}` : "فروش مستقیم میران"),
        slug: product.slug,
        sku: variant?.sku || product.sku || product.id.toUpperCase(),
        title: product.title,
        quantity,
        unitPriceMinor: selectedPrice.amountMinor,
      });
    }
    if (totalQuantity > 100) return invalid();

    const deliveryMinor = getDeliveryPriceMinor(
      currency || IRAN_CURRENCY,
      deliveryMethod,
      storefront.commerce.deliveryFees,
    );
    const order = await createOrderRecord({
      idempotencyKey,
      customerName: address.recipientName,
      customerEmail: user.email,
      customerPhone: address.phone,
      addressSourceId: address.id,
      addressLabel: address.label,
      addressLine: address.addressLine,
      city: address.city,
      province: address.province,
      postcode: address.postcode,
      latitude: address.latitude,
      longitude: address.longitude,
      deliveryMethod,
      currency: currency || IRAN_CURRENCY,
      deliveryMinor,
      reservationMinutes: storefront.commerce.reservationMinutes,
      lines,
    });
    return privateJson(
      {
        order: {
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          totalMinor: order.totalMinor,
          currency: order.currency,
          createdAt: order.createdAt,
        },
      },
      201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/OUT_OF_STOCK|constraint|UNIQUE/i.test(message)) {
      return privateJson(
        { error: "موجودی یا اطلاعات سفارش تغییر کرده است؛ دوباره تلاش کنید." },
        409,
      );
    }
    return privateJson(
      { error: "ثبت سفارش موقتاً ممکن نیست؛ سبد شما حفظ شده است." },
      503,
    );
  }
}

function clean(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function invalid() {
  return privateJson({ error: "اطلاعات سفارش کامل یا معتبر نیست." }, 422);
}

async function readBoundedJson(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
    return JSON_TOO_LARGE;
  }
  const text = await request.text().catch(() => "");
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) {
    return JSON_TOO_LARGE;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return INVALID_JSON;
  }
}

function privateJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store, max-age=0",
      pragma: "no-cache",
    },
  });
}
