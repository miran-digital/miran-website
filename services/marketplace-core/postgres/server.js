import { createServer } from "node:http";
import { PostgresCartService } from "./cart-service.js";
import { PostgresCatalogManagementService } from "./catalog-management-service.js";
import { PostgresCheckoutService } from "./checkout-service.js";
import { migratePostgres, openPostgresPool } from "./database.js";
import { PostgresLegacyPreviewImportService } from "./legacy-preview-import-service.js";
import { PostgresLogisticsService } from "./logistics-service.js";
import { PostgresMarketplaceService } from "./marketplace-service.js";
import { PostgresOrderQueryService } from "./order-query-service.js";
import { PostgresPaymentService } from "./payment-service.js";
import { PostgresProductMediaUploadService } from "./product-media-upload-service.js";
import { PostgresSellerDocumentUploadService } from "./seller-document-upload-service.js";
import { PostgresSellerService } from "./seller-service.js";
import { PostgresStorefrontCmsService } from "./storefront-cms-service.js";
import { S3PrivateObjectStorage } from "../src/private-object-storage.js";
import { S3PublicAssetStorage } from "../src/public-asset-storage.js";
import { ZarinpalClient } from "../src/zarinpal-client.js";

function sendJson(res, status, body) {
  if (status === 204) {
    res.writeHead(204);
    return res.end();
  }
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(data);
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) {
      const error = new Error("Request too large");
      error.code = "PAYLOAD_TOO_LARGE";
      throw error;
    }
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Invalid JSON");
    error.code = "INVALID_JSON";
    throw error;
  }
}

function bearer(req) {
  const value = req.headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : null;
}

function statusFor(error) {
  if (error?.code === "UNAUTHORIZED") return 401;
  if (error?.code === "FORBIDDEN") return 403;
  if (error?.code === "NOT_FOUND") return 404;
  if (["OUT_OF_STOCK", "CONFLICT", "STORAGE_OBJECT_NOT_FOUND", "STORAGE_OBJECT_MISMATCH"].includes(error?.code)) return 409;
  if (error?.code === "PAYLOAD_TOO_LARGE") return 413;
  if (["STORAGE_NOT_CONFIGURED", "PAYMENT_NOT_CONFIGURED", "DATABASE_NOT_CONFIGURED"].includes(error?.code)) return 503;
  if (error?.code === "STORAGE_CONFIG_INVALID") return 500;
  if (["PAYMENT_PROVIDER_ERROR", "PAYMENT_VERIFICATION_FAILED"].includes(error?.code)) return 502;
  return 400;
}

export async function startPostgresServer({
  port = Number(process.env.PORT || 3001),
  host = process.env.HOST || "0.0.0.0",
} = {}) {
  const pool = openPostgresPool();
  try {
    await migratePostgres(pool);
  } catch (error) {
    await pool.end();
    throw error;
  }

  const marketplace = new PostgresMarketplaceService(pool);
  const cart = new PostgresCartService(pool);
  const logistics = new PostgresLogisticsService(pool);
  const checkout = new PostgresCheckoutService(pool, marketplace, cart, {
    reservationMinutes: 30,
  });
  const catalog = new PostgresCatalogManagementService(pool);
  const sellers = new PostgresSellerService(pool);
  const cms = new PostgresStorefrontCmsService(pool);
  const orders = new PostgresOrderQueryService(pool);
  const legacyImport = new PostgresLegacyPreviewImportService(pool, catalog);
  const privateStorage = new S3PrivateObjectStorage();
  const publicStorage = new S3PublicAssetStorage();
  const sellerDocuments = new PostgresSellerDocumentUploadService(pool, sellers, privateStorage);
  const productMedia = new PostgresProductMediaUploadService(pool, catalog, publicStorage);
  const zarinpal = new ZarinpalClient({
    merchantId: process.env.ZARINPAL_MERCHANT_ID,
    sandbox: process.env.ZARINPAL_SANDBOX === "true",
  });
  const payments = new PostgresPaymentService(pool, zarinpal, { reservationMinutes: 30 });
  const publicSiteUrl = String(process.env.MIRAN_PUBLIC_URL || "https://almiran.ir").replace(/\/+$/, "");

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/health") {
        await pool.query("SELECT 1");
        return sendJson(res, 200, {
          ok: true,
          service: "marketplace-core",
          database: "postgresql",
        });
      }

      if (req.method === "GET" && url.pathname === "/v1/storefront") {
        return sendJson(res, 200, await cms.getPublic());
      }
      if (req.method === "GET" && url.pathname === "/v1/catalog/categories") {
        return sendJson(res, 200, await marketplace.listCategories());
      }
      if (req.method === "GET" && url.pathname === "/v1/catalog/products") {
        return sendJson(
          res,
          200,
          await marketplace.listProducts({
            limit: url.searchParams.get("limit") || 24,
            offset: url.searchParams.get("offset") || 0,
            categorySlug: url.searchParams.get("category"),
            amazingOnly: url.searchParams.get("amazing") === "1",
            query: url.searchParams.get("q") || "",
          }),
        );
      }
      const publicProductMatch = url.pathname.match(/^\/v1\/catalog\/products\/([^/]+)$/);
      if (req.method === "GET" && publicProductMatch) {
        return sendJson(res, 200, await marketplace.getProduct(decodeURIComponent(publicProductMatch[1])));
      }

      if (req.method === "POST" && url.pathname === "/v1/payments/zarinpal/verify") {
        const body = await readJson(req);
        return sendJson(
          res,
          200,
          await payments.verifyZarinpalCallback({
            authority: body.authority,
            status: body.status,
          }),
        );
      }

      if (req.method === "POST" && url.pathname === "/v1/auth/register") {
        const body = await readJson(req);
        return sendJson(res, 201, await marketplace.register({ email: body.email, password: body.password }));
      }
      if (req.method === "POST" && url.pathname === "/v1/auth/login") {
        return sendJson(res, 200, await marketplace.login(await readJson(req)));
      }

      const token = bearer(req);
      const user = token ? await marketplace.authenticate(token) : null;
      if (!user) return sendJson(res, 401, { error: "UNAUTHORIZED" });

      if (req.method === "POST" && url.pathname === "/v1/auth/logout") {
        await marketplace.logout(token);
        return sendJson(res, 204);
      }
      if (req.method === "GET" && url.pathname === "/v1/me") {
        return sendJson(res, 200, user);
      }

      if (url.pathname === "/v1/addresses") {
        if (req.method === "GET") return sendJson(res, 200, await marketplace.listAddresses(user.id));
        if (req.method === "POST") return sendJson(res, 201, await marketplace.addAddress(user.id, await readJson(req)));
      }
      const addressDefaultMatch = url.pathname.match(/^\/v1\/addresses\/([^/]+)\/default$/);
      if (req.method === "PATCH" && addressDefaultMatch) {
        return sendJson(res, 200, await marketplace.setDefaultAddress(user.id, decodeURIComponent(addressDefaultMatch[1])));
      }
      const addressDeleteMatch = url.pathname.match(/^\/v1\/addresses\/([^/]+)$/);
      if (req.method === "DELETE" && addressDeleteMatch) {
        return sendJson(res, 200, await marketplace.removeAddress(user.id, decodeURIComponent(addressDeleteMatch[1])));
      }

      if (url.pathname === "/v1/cart") {
        if (req.method === "GET") return sendJson(res, 200, await cart.get(user.id));
        if (req.method === "DELETE") return sendJson(res, 200, await cart.clear(user.id));
      }
      if (req.method === "POST" && url.pathname === "/v1/cart/merge") {
        const body = await readJson(req);
        return sendJson(res, 200, await cart.merge(user.id, body.items || []));
      }
      const cartItemMatch = url.pathname.match(/^\/v1\/cart\/items\/([^/]+)$/);
      if (cartItemMatch && req.method === "PUT") {
        const body = await readJson(req);
        return sendJson(
          res,
          200,
          await cart.setLine(user.id, decodeURIComponent(cartItemMatch[1]), body.quantity),
        );
      }
      if (cartItemMatch && req.method === "DELETE") {
        return sendJson(res, 200, await cart.removeLine(user.id, decodeURIComponent(cartItemMatch[1])));
      }

      if (req.method === "GET" && url.pathname === "/v1/shipping/methods") {
        return sendJson(
          res,
          200,
          await logistics.listAvailable(user.id, url.searchParams.get("addressId"), {
            merchandiseTotalIrr: url.searchParams.get("merchandiseTotalIrr"),
          }),
        );
      }

      if (req.method === "POST" && url.pathname === "/v1/sellers") {
        return sendJson(res, 201, await sellers.requestSeller(user.id, await readJson(req)));
      }
      if (req.method === "GET" && url.pathname === "/v1/sellers/me") {
        return sendJson(res, 200, await sellers.getMine(user.id));
      }
      if (req.method === "POST" && url.pathname === "/v1/sellers/documents") {
        return sendJson(res, 201, await sellers.addDocument(user.id, await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/v1/sellers/documents/upload-ticket") {
        return sendJson(res, 201, await sellerDocuments.issueUploadTicket(user.id, await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/v1/sellers/documents/complete") {
        return sendJson(res, 201, await sellerDocuments.completeUpload(user.id, await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/v1/sellers/guarantees") {
        return sendJson(res, 201, await sellers.addGuarantee(user.id, await readJson(req)));
      }

      if (req.method === "GET" && url.pathname === "/v1/admin/storefront") {
        return sendJson(res, 200, await cms.getManaged(user.id));
      }
      if (req.method === "POST" && url.pathname === "/v1/admin/legacy-preview/content") {
        return sendJson(res, 200, await legacyImport.importContent(user.id, await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/v1/admin/legacy-preview/product") {
        return sendJson(res, 201, await legacyImport.importProductDraft(user.id, await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/v1/admin/header-messages") {
        return sendJson(res, 201, await cms.createHeaderMessage(user.id, await readJson(req)));
      }
      const headerMessageMatch = url.pathname.match(/^\/v1\/admin\/header-messages\/([^/]+)$/);
      if (headerMessageMatch && req.method === "PATCH") {
        return sendJson(res, 200, await cms.updateHeaderMessage(user.id, decodeURIComponent(headerMessageMatch[1]), await readJson(req)));
      }
      if (headerMessageMatch && req.method === "DELETE") {
        return sendJson(res, 200, await cms.deleteHeaderMessage(user.id, decodeURIComponent(headerMessageMatch[1])));
      }
      if (req.method === "POST" && url.pathname === "/v1/admin/banners") {
        return sendJson(res, 201, await cms.createBanner(user.id, await readJson(req)));
      }
      const bannerMatch = url.pathname.match(/^\/v1\/admin\/banners\/([^/]+)$/);
      if (bannerMatch && req.method === "PATCH") {
        return sendJson(res, 200, await cms.updateBanner(user.id, decodeURIComponent(bannerMatch[1]), await readJson(req)));
      }
      if (bannerMatch && req.method === "DELETE") {
        return sendJson(res, 200, await cms.deleteBanner(user.id, decodeURIComponent(bannerMatch[1])));
      }
      const sectionMatch = url.pathname.match(/^\/v1\/admin\/home-sections\/([^/]+)$/);
      if (sectionMatch && req.method === "PATCH") {
        return sendJson(res, 200, await cms.updateSection(user.id, decodeURIComponent(sectionMatch[1]), await readJson(req)));
      }

      if (req.method === "GET" && url.pathname === "/v1/admin/sellers") {
        return sendJson(res, 200, await sellers.listManaged(user.id));
      }
      const sellerReviewMatch = url.pathname.match(/^\/v1\/admin\/sellers\/([^/]+)\/review$/);
      if (req.method === "PATCH" && sellerReviewMatch) {
        const body = await readJson(req);
        const sellerId = decodeURIComponent(sellerReviewMatch[1]);
        if (body.status === "APPROVED") return sendJson(res, 200, await sellers.approve(user.id, sellerId));
        if (body.status === "REJECTED") return sendJson(res, 200, await sellers.reject(user.id, sellerId, body.reason));
        if (body.status === "SUSPENDED") return sendJson(res, 200, await sellers.suspend(user.id, sellerId, body.reason));
        const error = new Error("Invalid seller review status");
        error.code = "INVALID_INPUT";
        throw error;
      }
      const documentDownloadMatch = url.pathname.match(/^\/v1\/admin\/seller-documents\/([^/]+)\/download-ticket$/);
      if (req.method === "GET" && documentDownloadMatch) {
        return sendJson(
          res,
          200,
          await sellerDocuments.issueAdminDownloadTicket(user.id, decodeURIComponent(documentDownloadMatch[1])),
        );
      }
      const documentReviewMatch = url.pathname.match(/^\/v1\/admin\/seller-documents\/([^/]+)\/review$/);
      if (req.method === "PATCH" && documentReviewMatch) {
        const body = await readJson(req);
        return sendJson(res, 200, await sellers.reviewDocument(user.id, decodeURIComponent(documentReviewMatch[1]), body.status));
      }
      const guaranteeReviewMatch = url.pathname.match(/^\/v1\/admin\/seller-guarantees\/([^/]+)\/review$/);
      if (req.method === "PATCH" && guaranteeReviewMatch) {
        const body = await readJson(req);
        return sendJson(res, 200, await sellers.reviewGuarantee(user.id, decodeURIComponent(guaranteeReviewMatch[1]), body.status));
      }

      if (url.pathname === "/v1/admin/categories") {
        if (req.method === "GET") return sendJson(res, 200, await catalog.listCategoriesManaged(user.id));
        if (req.method === "POST") return sendJson(res, 201, await catalog.createCategory(user.id, await readJson(req)));
      }
      const categoryMatch = url.pathname.match(/^\/v1\/admin\/categories\/([^/]+)$/);
      if (categoryMatch && req.method === "PATCH") {
        return sendJson(res, 200, await catalog.updateCategory(user.id, decodeURIComponent(categoryMatch[1]), await readJson(req)));
      }
      if (categoryMatch && req.method === "DELETE") {
        return sendJson(res, 200, await catalog.removeCategory(user.id, decodeURIComponent(categoryMatch[1])));
      }

      if (url.pathname === "/v1/admin/shipping-methods") {
        if (req.method === "GET") return sendJson(res, 200, await logistics.listManaged(user.id));
        if (req.method === "POST") return sendJson(res, 201, await logistics.create(user.id, await readJson(req)));
      }
      const shippingMethodMatch = url.pathname.match(/^\/v1\/admin\/shipping-methods\/([^/]+)$/);
      if (shippingMethodMatch && req.method === "PATCH") {
        return sendJson(
          res,
          200,
          await logistics.update(user.id, decodeURIComponent(shippingMethodMatch[1]), await readJson(req)),
        );
      }
      if (shippingMethodMatch && req.method === "DELETE") {
        return sendJson(res, 200, await logistics.remove(user.id, decodeURIComponent(shippingMethodMatch[1])));
      }

      if (req.method === "GET" && url.pathname === "/v1/admin/orders") {
        return sendJson(
          res,
          200,
          await orders.listManaged(user.id, {
            limit: url.searchParams.get("limit") || 100,
            offset: url.searchParams.get("offset") || 0,
            status: url.searchParams.get("status"),
          }),
        );
      }

      if (req.method === "POST" && url.pathname === "/v1/products") {
        return sendJson(res, 201, await catalog.createProduct(user.id, await readJson(req)));
      }
      if (req.method === "GET" && url.pathname === "/v1/manage/products") {
        return sendJson(res, 200, await catalog.listManaged(user.id));
      }
      const productMatch = url.pathname.match(/^\/v1\/products\/([^/]+)$/);
      if (req.method === "PATCH" && productMatch) {
        return sendJson(res, 200, await catalog.updateProduct(user.id, decodeURIComponent(productMatch[1]), await readJson(req)));
      }
      const publishMatch = url.pathname.match(/^\/v1\/products\/([^/]+)\/publish$/);
      if (req.method === "PATCH" && publishMatch) {
        const body = await readJson(req);
        return sendJson(res, 200, await catalog.setPublished(user.id, decodeURIComponent(publishMatch[1]), body.published !== false));
      }
      const archiveMatch = url.pathname.match(/^\/v1\/products\/([^/]+)\/archive$/);
      if (req.method === "PATCH" && archiveMatch) {
        const body = await readJson(req);
        return sendJson(res, 200, await catalog.setArchived(user.id, decodeURIComponent(archiveMatch[1]), body.archived !== false));
      }
      const inventoryMatch = url.pathname.match(/^\/v1\/products\/([^/]+)\/inventory$/);
      if (req.method === "PATCH" && inventoryMatch) {
        const body = await readJson(req);
        return sendJson(res, 200, await catalog.setInventory(user.id, decodeURIComponent(inventoryMatch[1]), body.stockOnHand));
      }
      const mediaUploadTicketMatch = url.pathname.match(/^\/v1\/products\/([^/]+)\/media\/upload-ticket$/);
      if (req.method === "POST" && mediaUploadTicketMatch) {
        return sendJson(
          res,
          201,
          await productMedia.issueUploadTicket(user.id, decodeURIComponent(mediaUploadTicketMatch[1]), await readJson(req)),
        );
      }
      const mediaCompleteMatch = url.pathname.match(/^\/v1\/products\/([^/]+)\/media\/complete$/);
      if (req.method === "POST" && mediaCompleteMatch) {
        return sendJson(
          res,
          201,
          await productMedia.completeUpload(user.id, decodeURIComponent(mediaCompleteMatch[1]), await readJson(req)),
        );
      }
      const mediaMatch = url.pathname.match(/^\/v1\/products\/([^/]+)\/media$/);
      if (req.method === "POST" && mediaMatch) {
        return sendJson(res, 201, await catalog.addMedia(user.id, decodeURIComponent(mediaMatch[1]), await readJson(req)));
      }
      const mediaDeleteMatch = url.pathname.match(/^\/v1\/products\/([^/]+)\/media\/([^/]+)$/);
      if (req.method === "DELETE" && mediaDeleteMatch) {
        return sendJson(
          res,
          200,
          await catalog.removeMedia(
            user.id,
            decodeURIComponent(mediaDeleteMatch[1]),
            decodeURIComponent(mediaDeleteMatch[2]),
          ),
        );
      }

      if (req.method === "GET" && url.pathname === "/v1/orders") {
        return sendJson(
          res,
          200,
          await orders.listMine(user.id, {
            limit: url.searchParams.get("limit") || 50,
            offset: url.searchParams.get("offset") || 0,
          }),
        );
      }
      const orderMatch = url.pathname.match(/^\/v1\/orders\/([^/]+)$/);
      if (req.method === "GET" && orderMatch) {
        return sendJson(res, 200, await orders.getMine(user.id, decodeURIComponent(orderMatch[1])));
      }
      if (req.method === "POST" && url.pathname === "/v1/orders") {
        return sendJson(res, 201, await marketplace.createOrder(user.id, await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/v1/checkout/orders") {
        return sendJson(res, 201, await checkout.createOrderFromCart(user.id, await readJson(req)));
      }

      if (req.method === "POST" && url.pathname === "/v1/payments/zarinpal/start") {
        const body = await readJson(req);
        return sendJson(
          res,
          201,
          await payments.startZarinpal(user.id, String(body.orderId || ""), {
            callbackUrl: `${publicSiteUrl}/api/payments/zarinpal/callback`,
            email: user.email,
          }),
        );
      }

      return sendJson(res, 404, { error: "NOT_FOUND" });
    } catch (error) {
      console.error("marketplace-core request failed", {
        method: req.method,
        path: req.url?.split("?", 1)[0],
        code: error?.code || "BAD_REQUEST",
        name: error?.name,
      });
      return sendJson(res, statusFor(error), {
        error: error?.code || "BAD_REQUEST",
        message: error?.message || "Request failed",
      });
    }
  });

  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return { server, pool, close };
}
