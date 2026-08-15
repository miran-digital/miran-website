import { createServer } from "node:http";
import { AddressService } from "./address-service.js";
import { CatalogService } from "./catalog-service.js";
import { CategoryService } from "./category-service.js";
import { MarketplaceCore } from "./core.js";
import { migrateSqlite, openSqliteDatabase } from "./database.js";
import { OrderQueryService } from "./order-query-service.js";
import { ProductCreateService } from "./product-create-service.js";
import { ProductLifecycleService } from "./product-lifecycle-service.js";
import { PublicCatalogService } from "./public-catalog-service.js";
import { SellerVerificationService } from "./seller-verification-service.js";
import { StorefrontCmsService } from "./storefront-cms-service.js";

const db = openSqliteDatabase();
migrateSqlite(db);
const core = new MarketplaceCore(db);
const addresses = new AddressService(db);
const catalog = new CatalogService(db);
const categories = new CategoryService(db);
const orders = new OrderQueryService(db);
const productCreator = new ProductCreateService(db);
const productLifecycle = new ProductLifecycleService(db);
const publicCatalog = new PublicCatalogService(db);
const sellerVerification = new SellerVerificationService(db);
const storefrontCms = new StorefrontCmsService(db);

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
      throw Object.assign(new Error("Request too large"), { code: "PAYLOAD_TOO_LARGE" });
    }
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { code: "INVALID_JSON" });
  }
}

function bearer(req) {
  const value = req.headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : null;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { ok: true, service: "marketplace-core" });
    }

    if (req.method === "GET" && url.pathname === "/v1/storefront") {
      return sendJson(res, 200, storefrontCms.getPublic());
    }

    if (req.method === "GET" && url.pathname === "/v1/catalog/categories") {
      return sendJson(res, 200, publicCatalog.listCategories());
    }

    if (req.method === "GET" && url.pathname === "/v1/catalog/products") {
      return sendJson(res, 200, publicCatalog.listProducts({
        limit: url.searchParams.get("limit") || 24,
        offset: url.searchParams.get("offset") || 0,
        categorySlug: url.searchParams.get("category"),
        amazingOnly: url.searchParams.get("amazing") === "1",
        query: url.searchParams.get("q") || "",
      }));
    }

    const publicProductMatch = url.pathname.match(/^\/v1\/catalog\/products\/([^/]+)$/);
    if (req.method === "GET" && publicProductMatch) {
      return sendJson(res, 200, publicCatalog.getProduct(decodeURIComponent(publicProductMatch[1])));
    }

    if (req.method === "POST" && url.pathname === "/v1/auth/register") {
      const body = await readJson(req);
      return sendJson(res, 201, core.register({ email: body.email, password: body.password }));
    }

    if (req.method === "POST" && url.pathname === "/v1/auth/login") {
      return sendJson(res, 200, core.login(await readJson(req)));
    }

    const token = bearer(req);
    const user = token ? core.authenticate(token) : null;
    if (!user) return sendJson(res, 401, { error: "UNAUTHORIZED" });

    if (req.method === "POST" && url.pathname === "/v1/auth/logout") {
      core.logout(token);
      return sendJson(res, 204);
    }
    if (req.method === "GET" && url.pathname === "/v1/me") return sendJson(res, 200, user);

    if (url.pathname === "/v1/addresses") {
      if (req.method === "GET") return sendJson(res, 200, addresses.list(user.id));
      if (req.method === "POST") return sendJson(res, 201, core.addAddress(user.id, await readJson(req)));
    }

    const addressDefaultMatch = url.pathname.match(/^\/v1\/addresses\/([^/]+)\/default$/);
    if (req.method === "PATCH" && addressDefaultMatch) {
      return sendJson(res, 200, addresses.setDefault(user.id, addressDefaultMatch[1]));
    }

    const addressDeleteMatch = url.pathname.match(/^\/v1\/addresses\/([^/]+)$/);
    if (req.method === "DELETE" && addressDeleteMatch) {
      return sendJson(res, 200, addresses.remove(user.id, addressDeleteMatch[1]));
    }

    if (req.method === "POST" && url.pathname === "/v1/sellers") {
      return sendJson(res, 201, core.requestSeller(user.id, await readJson(req)));
    }
    if (req.method === "GET" && url.pathname === "/v1/sellers/me") {
      return sendJson(res, 200, sellerVerification.getMine(user.id));
    }
    if (req.method === "POST" && url.pathname === "/v1/sellers/documents") {
      return sendJson(res, 201, sellerVerification.addDocument(user.id, await readJson(req)));
    }
    if (req.method === "POST" && url.pathname === "/v1/sellers/guarantees") {
      return sendJson(res, 201, sellerVerification.addGuarantee(user.id, await readJson(req)));
    }

    if (req.method === "GET" && url.pathname === "/v1/admin/storefront") {
      return sendJson(res, 200, storefrontCms.getManaged(user.id));
    }
    if (req.method === "POST" && url.pathname === "/v1/admin/header-messages") {
      return sendJson(res, 201, storefrontCms.createHeaderMessage(user.id, await readJson(req)));
    }
    const headerMessageMatch = url.pathname.match(/^\/v1\/admin\/header-messages\/([^/]+)$/);
    if (headerMessageMatch && req.method === "PATCH") {
      return sendJson(res, 200, storefrontCms.updateHeaderMessage(user.id, decodeURIComponent(headerMessageMatch[1]), await readJson(req)));
    }
    if (headerMessageMatch && req.method === "DELETE") {
      return sendJson(res, 200, storefrontCms.deleteHeaderMessage(user.id, decodeURIComponent(headerMessageMatch[1])));
    }

    if (req.method === "POST" && url.pathname === "/v1/admin/banners") {
      return sendJson(res, 201, storefrontCms.createBanner(user.id, await readJson(req)));
    }
    const bannerMatch = url.pathname.match(/^\/v1\/admin\/banners\/([^/]+)$/);
    if (bannerMatch && req.method === "PATCH") {
      return sendJson(res, 200, storefrontCms.updateBanner(user.id, decodeURIComponent(bannerMatch[1]), await readJson(req)));
    }
    if (bannerMatch && req.method === "DELETE") {
      return sendJson(res, 200, storefrontCms.deleteBanner(user.id, decodeURIComponent(bannerMatch[1])));
    }

    const sectionMatch = url.pathname.match(/^\/v1\/admin\/home-sections\/([^/]+)$/);
    if (sectionMatch && req.method === "PATCH") {
      return sendJson(res, 200, storefrontCms.updateSection(user.id, decodeURIComponent(sectionMatch[1]), await readJson(req)));
    }

    if (req.method === "GET" && url.pathname === "/v1/admin/sellers") {
      return sendJson(res, 200, sellerVerification.listManaged(user.id));
    }

    if (req.method === "GET" && url.pathname === "/v1/admin/orders") {
      return sendJson(res, 200, orders.listManaged(user.id, {
        limit: url.searchParams.get("limit") || 100,
        offset: url.searchParams.get("offset") || 0,
        status: url.searchParams.get("status"),
      }));
    }

    const sellerReviewMatch = url.pathname.match(/^\/v1\/admin\/sellers\/([^/]+)\/review$/);
    if (req.method === "PATCH" && sellerReviewMatch) {
      const body = await readJson(req);
      const sellerId = decodeURIComponent(sellerReviewMatch[1]);
      if (body.status === "APPROVED") return sendJson(res, 200, sellerVerification.approve(user.id, sellerId));
      if (body.status === "REJECTED") return sendJson(res, 200, sellerVerification.reject(user.id, sellerId, body.reason));
      if (body.status === "SUSPENDED") return sendJson(res, 200, sellerVerification.suspend(user.id, sellerId, body.reason));
      throw Object.assign(new Error("Invalid seller review status"), { code: "INVALID_INPUT" });
    }

    const documentReviewMatch = url.pathname.match(/^\/v1\/admin\/seller-documents\/([^/]+)\/review$/);
    if (req.method === "PATCH" && documentReviewMatch) {
      const body = await readJson(req);
      return sendJson(res, 200, sellerVerification.reviewDocument(user.id, decodeURIComponent(documentReviewMatch[1]), body.status));
    }

    const guaranteeReviewMatch = url.pathname.match(/^\/v1\/admin\/seller-guarantees\/([^/]+)\/review$/);
    if (req.method === "PATCH" && guaranteeReviewMatch) {
      const body = await readJson(req);
      return sendJson(res, 200, sellerVerification.reviewGuarantee(user.id, decodeURIComponent(guaranteeReviewMatch[1]), body.status));
    }

    if (url.pathname === "/v1/admin/categories") {
      if (req.method === "GET") return sendJson(res, 200, categories.listManaged(user.id));
      if (req.method === "POST") return sendJson(res, 201, categories.create(user.id, await readJson(req)));
    }

    const categoryMatch = url.pathname.match(/^\/v1\/admin\/categories\/([^/]+)$/);
    if (categoryMatch && req.method === "PATCH") {
      return sendJson(res, 200, categories.update(user.id, decodeURIComponent(categoryMatch[1]), await readJson(req)));
    }
    if (categoryMatch && req.method === "DELETE") {
      return sendJson(res, 200, categories.remove(user.id, decodeURIComponent(categoryMatch[1])));
    }

    if (req.method === "POST" && url.pathname === "/v1/products") {
      return sendJson(res, 201, productCreator.create(user.id, await readJson(req)));
    }
    if (req.method === "GET" && url.pathname === "/v1/manage/products") {
      return sendJson(res, 200, catalog.listManaged(user.id));
    }

    const productMatch = url.pathname.match(/^\/v1\/products\/([^/]+)$/);
    if (req.method === "PATCH" && productMatch) {
      return sendJson(res, 200, catalog.updateProduct(user.id, decodeURIComponent(productMatch[1]), await readJson(req)));
    }

    const publishMatch = url.pathname.match(/^\/v1\/products\/([^/]+)\/publish$/);
    if (req.method === "PATCH" && publishMatch) {
      const body = await readJson(req);
      return sendJson(res, 200, catalog.setPublished(user.id, decodeURIComponent(publishMatch[1]), body.published !== false));
    }

    const archiveMatch = url.pathname.match(/^\/v1\/products\/([^/]+)\/archive$/);
    if (req.method === "PATCH" && archiveMatch) {
      const body = await readJson(req);
      return sendJson(res, 200, productLifecycle.setArchived(user.id, decodeURIComponent(archiveMatch[1]), body.archived !== false));
    }

    const inventoryMatch = url.pathname.match(/^\/v1\/products\/([^/]+)\/inventory$/);
    if (req.method === "PATCH" && inventoryMatch) {
      const body = await readJson(req);
      return sendJson(res, 200, catalog.setInventory(user.id, decodeURIComponent(inventoryMatch[1]), body.stockOnHand));
    }

    const mediaMatch = url.pathname.match(/^\/v1\/products\/([^/]+)\/media$/);
    if (req.method === "POST" && mediaMatch) {
      return sendJson(res, 201, catalog.addMedia(user.id, decodeURIComponent(mediaMatch[1]), await readJson(req)));
    }

    const mediaDeleteMatch = url.pathname.match(/^\/v1\/products\/([^/]+)\/media\/([^/]+)$/);
    if (req.method === "DELETE" && mediaDeleteMatch) {
      return sendJson(res, 200, productLifecycle.removeMedia(
        user.id,
        decodeURIComponent(mediaDeleteMatch[1]),
        decodeURIComponent(mediaDeleteMatch[2]),
      ));
    }

    if (req.method === "GET" && url.pathname === "/v1/orders") {
      return sendJson(res, 200, orders.listMine(user.id, {
        limit: url.searchParams.get("limit") || 50,
        offset: url.searchParams.get("offset") || 0,
      }));
    }

    const orderMatch = url.pathname.match(/^\/v1\/orders\/([^/]+)$/);
    if (req.method === "GET" && orderMatch) {
      return sendJson(res, 200, orders.getMine(user.id, decodeURIComponent(orderMatch[1])));
    }

    if (req.method === "POST" && url.pathname === "/v1/orders") {
      return sendJson(res, 201, core.createOrder(user.id, await readJson(req)));
    }

    return sendJson(res, 404, { error: "NOT_FOUND" });
  } catch (error) {
    const status = error.code === "UNAUTHORIZED" ? 401
      : error.code === "FORBIDDEN" ? 403
      : error.code === "NOT_FOUND" ? 404
      : error.code === "OUT_OF_STOCK" || error.code === "CONFLICT" ? 409
      : error.code === "PAYLOAD_TOO_LARGE" ? 413
      : 400;
    return sendJson(res, status, { error: error.code || "BAD_REQUEST", message: error.message });
  }
});

const port = Number(process.env.PORT || 3001);
server.listen(port, "0.0.0.0", () => {
  console.log(`marketplace-core listening on :${port}`);
});
