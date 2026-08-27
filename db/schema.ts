import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const storefrontSettings = sqliteTable("storefront_settings", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedBy: text("updated_by").notNull(),
});

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    englishTitle: text("english_title"),
    brand: text("brand").notNull(),
    category: text("category").notNull(),
    sku: text("sku").notNull().default(""),
    shortDescription: text("short_description"),
    description: text("description").notNull().default(""),
    placement: text("placement").notNull(),
    // Kept at the legacy database default to avoid rebuilding a live table;
    // every application write explicitly persists IRR.
    currency: text("currency").notNull().default("GBP"),
    priceMinor: integer("price_minor").notNull(),
    compareAtPriceMinor: integer("compare_at_price_minor").notNull().default(0),
    discountType: text("discount_type").notNull().default("none"),
    discountValue: integer("discount_value").notNull().default(0),
    stockQuantity: integer("stock_quantity").notNull().default(0),
    reservedQuantity: integer("reserved_quantity").notNull().default(0),
    imageUrl: text("image_url").notNull().default(""),
    videoUrl: text("video_url").notNull().default(""),
    amazingEnabled: integer("amazing_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    amazingStartsAt: text("amazing_starts_at").notNull().default(""),
    amazingEndsAt: text("amazing_ends_at").notNull().default(""),
    visible: integer("visible", { mode: "boolean" }).notNull().default(true),
    archivedAt: text("archived_at").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("products_placement_visible_idx").on(
      table.placement,
      table.visible,
    ),
    index("products_category_idx").on(table.category),
    index("products_sku_idx").on(table.sku),
  ],
);

export const productVariants = sqliteTable(
  "product_variants",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    title: text("title").notNull(),
    sku: text("sku").notNull().default(""),
    priceMinor: integer("price_minor").notNull(),
    compareAtPriceMinor: integer("compare_at_price_minor").notNull().default(0),
    stockQuantity: integer("stock_quantity").notNull().default(0),
    reservedQuantity: integer("reserved_quantity").notNull().default(0),
    visible: integer("visible", { mode: "boolean" }).notNull().default(true),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("product_variants_product_idx").on(table.productId, table.visible),
    index("product_variants_sku_idx").on(table.sku),
  ],
);

export const sellerOffers = sqliteTable(
  "seller_offers",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    sellerApplicationId: text("seller_application_id").notNull(),
    sellerName: text("seller_name").notNull(),
    priceMinor: integer("price_minor").notNull(),
    stockQuantity: integer("stock_quantity").notNull().default(0),
    reservedQuantity: integer("reserved_quantity").notNull().default(0),
    guaranteeLabel: text("guarantee_label").notNull().default(""),
    deliveryLabel: text("delivery_label").notNull().default(""),
    visible: integer("visible", { mode: "boolean" }).notNull().default(true),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("seller_offers_product_idx").on(table.productId, table.visible),
    index("seller_offers_seller_idx").on(table.sellerApplicationId),
  ],
);

export const catalogAttributeDefinitions = sqliteTable(
  "catalog_attribute_definitions",
  {
    id: text("id").primaryKey(),
    categorySlug: text("category_slug").notNull(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    dataType: text("data_type").notNull().default("text"),
    unit: text("unit"),
    filterable: integer("filterable", { mode: "boolean" }).notNull().default(false),
    searchable: integer("searchable", { mode: "boolean" }).notNull().default(false),
    comparable: integer("comparable", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("catalog_attribute_category_code_unique").on(table.categorySlug, table.code),
    index("catalog_attribute_category_active_idx").on(table.categorySlug, table.active),
  ],
);

export const productAttributeValues = sqliteTable(
  "product_attribute_values",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    attributeId: text("attribute_id").notNull(),
    valueText: text("value_text"),
    valueNumber: real("value_number"),
    valueBoolean: integer("value_boolean", { mode: "boolean" }),
    normalizedValue: text("normalized_value").notNull().default(""),
    keyFeature: integer("key_feature", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    visible: integer("visible", { mode: "boolean" }).notNull().default(true),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("product_attribute_product_definition_unique").on(table.productId, table.attributeId),
    index("product_attribute_product_visible_idx").on(table.productId, table.visible, table.sortOrder),
    index("product_attribute_filter_text_idx").on(table.attributeId, table.normalizedValue, table.visible),
    index("product_attribute_filter_number_idx").on(table.attributeId, table.valueNumber, table.visible),
  ],
);

export const productVariantAttributeValues = sqliteTable(
  "product_variant_attribute_values",
  {
    id: text("id").primaryKey(),
    variantId: text("variant_id").notNull(),
    attributeId: text("attribute_id").notNull(),
    valueText: text("value_text"),
    valueNumber: real("value_number"),
    valueBoolean: integer("value_boolean", { mode: "boolean" }),
    normalizedValue: text("normalized_value").notNull().default(""),
    visible: integer("visible", { mode: "boolean" }).notNull().default(true),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("variant_attribute_variant_definition_unique").on(table.variantId, table.attributeId),
    index("variant_attribute_filter_text_idx").on(table.attributeId, table.normalizedValue, table.visible),
    index("variant_attribute_filter_number_idx").on(table.attributeId, table.valueNumber, table.visible),
  ],
);

export const productQuestions = sqliteTable(
  "product_questions",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerName: text("customer_name").notNull(),
    body: text("body").notNull(),
    answer: text("answer").notNull().default(""),
    status: text("status").notNull().default("pending"),
    answeredBy: text("answered_by").notNull().default(""),
    answeredAt: text("answered_at").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("product_questions_product_status_idx").on(table.productId, table.status, table.createdAt),
    index("product_questions_customer_idx").on(table.customerEmail, table.createdAt),
  ],
);

export const productPriceHistory = sqliteTable(
  "product_price_history",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    previousPriceMinor: integer("previous_price_minor").notNull(),
    newPriceMinor: integer("new_price_minor").notNull(),
    previousCompareAtPriceMinor: integer("previous_compare_at_price_minor").notNull().default(0),
    newCompareAtPriceMinor: integer("new_compare_at_price_minor").notNull().default(0),
    currency: text("currency").notNull().default("IRR"),
    changedBy: text("changed_by").notNull(),
    changedAt: text("changed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("product_price_history_product_time_idx").on(table.productId, table.changedAt),
    index("product_price_history_source_time_idx").on(table.sourceType, table.sourceId, table.changedAt),
  ],
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    orderNumber: text("order_number").notNull().unique(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: text("status").notNull().default("new"),
    paymentStatus: text("payment_status").notNull().default("not_collected"),
    reservationExpiresAt: text("reservation_expires_at").notNull().default(""),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone").notNull(),
    addressSourceId: text("address_source_id").notNull().default(""),
    addressLabel: text("address_label").notNull().default(""),
    addressLine: text("address_line").notNull(),
    city: text("city").notNull(),
    province: text("province").notNull().default(""),
    postcode: text("postcode").notNull(),
    latitude: integer("latitude_e6"),
    longitude: integer("longitude_e6"),
    deliveryMethod: text("delivery_method").notNull(),
    // Kept at the legacy database default; order creation always binds IRR.
    currency: text("currency").notNull().default("GBP"),
    subtotalMinor: integer("subtotal_minor").notNull(),
    deliveryMinor: integer("delivery_minor").notNull(),
    totalMinor: integer("total_minor").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("orders_status_created_idx").on(table.status, table.createdAt),
    index("orders_email_created_idx").on(table.customerEmail, table.createdAt),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull(),
    productId: text("product_id").notNull(),
    variantId: text("variant_id").notNull().default(""),
    sellerOfferId: text("seller_offer_id").notNull().default(""),
    selectionLabel: text("selection_label").notNull().default(""),
    slug: text("slug").notNull(),
    sku: text("sku").notNull().default(""),
    title: text("title").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    lineTotalMinor: integer("line_total_minor").notNull(),
  },
  (table) => [index("order_items_order_idx").on(table.orderId)],
);

export const sellerApplications = sqliteTable(
  "seller_applications",
  {
    id: text("id").primaryKey(),
    storeName: text("store_name").notNull(),
    contactName: text("contact_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    category: text("category").notNull(),
    legalType: text("legal_type").notNull().default("individual"),
    registrationNumber: text("registration_number").notNull().default(""),
    address: text("address").notNull().default(""),
    notes: text("notes").notNull().default(""),
    guaranteeType: text("guarantee_type").notNull().default("review_later"),
    guaranteeAmountMinor: integer("guarantee_amount_minor").notNull().default(0),
    documentsJson: text("documents_json").notNull().default("[]"),
    documentStatus: text("document_status").notNull().default("missing"),
    guaranteeStatus: text("guarantee_status").notNull().default("not_requested"),
    agreementStatus: text("agreement_status").notNull().default("not_sent"),
    adminNotes: text("admin_notes").notNull().default(""),
    status: text("status").notNull().default("new"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("seller_applications_status_idx").on(table.status)],
);

export const adminAuditLog = sqliteTable(
  "admin_audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    subjectId: text("subject_id").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("admin_audit_created_at_idx").on(table.createdAt),
    uniqueIndex("admin_audit_order_paid_unique")
      .on(table.action, table.subjectId)
      .where(sql`action = 'order.paid'`),
  ],
);

export const adminOwnerCredentials = sqliteTable("admin_owner_credentials", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordSalt: text("password_salt").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordIterations: integer("password_iterations").notNull(),
  ownerEmail: text("owner_email").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedBy: text("updated_by").notNull(),
});

export const adminOwnerSessions = sqliteTable(
  "admin_owner_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    expiresAt: text("expires_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("admin_owner_sessions_owner_idx").on(table.ownerEmail, table.createdAt),
    index("admin_owner_sessions_expires_idx").on(table.expiresAt),
  ],
);

export const storefrontRevisions = sqliteTable(
  "storefront_revisions",
  {
    id: text("id").primaryKey(),
    data: text("data").notNull(),
    actorEmail: text("actor_email").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("storefront_revisions_created_idx").on(table.createdAt)],
);

export const paymentAttempts = sqliteTable(
  "payment_attempts",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull(),
    provider: text("provider").notNull(),
    authority: text("authority").notNull().default(""),
    status: text("status").notNull().default("pending"),
    amountMinor: integer("amount_minor").notNull(),
    providerReference: text("provider_reference").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("payment_attempts_order_idx").on(table.orderId),
    index("payment_attempts_authority_idx").on(table.authority),
    uniqueIndex("payment_attempts_pending_order_unique")
      .on(table.orderId)
      .where(sql`status = 'pending'`),
    uniqueIndex("payment_attempts_authority_unique")
      .on(table.authority)
      .where(sql`authority != ''`),
  ],
);

export const paymentProviderConfigs = sqliteTable("payment_provider_configs", {
  provider: text("provider").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  sandbox: integer("sandbox", { mode: "boolean" }).notNull().default(false),
  credentialsCiphertext: text("credentials_ciphertext").notNull().default(""),
  credentialsIv: text("credentials_iv").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedBy: text("updated_by").notNull(),
});

export const customerAddresses = sqliteTable(
  "customer_addresses",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    label: text("label").notNull().default(""),
    recipientName: text("recipient_name").notNull(),
    phone: text("phone").notNull(),
    addressLine: text("address_line").notNull(),
    city: text("city").notNull(),
    province: text("province").notNull(),
    postcode: text("postcode").notNull().default(""),
    latitude: integer("latitude_e6"),
    longitude: integer("longitude_e6"),
    isDefault: integer("is_default", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("customer_addresses_owner_idx").on(table.ownerEmail, table.updatedAt),
    index("customer_addresses_default_idx").on(table.ownerEmail, table.isDefault),
  ],
);

export const customerAccounts = sqliteTable(
  "customer_accounts",
  {
    authUserId: text("auth_user_id").primaryKey(),
    email: text("email").notNull().unique(),
    fullName: text("full_name").notNull().default(""),
    provider: text("provider").notNull().default("supabase"),
    emailConfirmedAt: text("email_confirmed_at").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("customer_accounts_email_idx").on(table.email),
    index("customer_accounts_last_seen_idx").on(table.lastSeenAt),
  ],
);

export const bankTransferReceipts = sqliteTable(
  "bank_transfer_receipts",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull(),
    customerEmail: text("customer_email").notNull(),
    storageKey: text("storage_key").notNull(),
    originalName: text("original_name").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    transferReference: text("transfer_reference").notNull().default(""),
    customerNote: text("customer_note").notNull().default(""),
    status: text("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by").notNull().default(""),
    reviewedAt: text("reviewed_at").notNull().default(""),
    reviewNote: text("review_note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("bank_transfer_receipts_order_idx").on(table.orderId, table.createdAt),
    index("bank_transfer_receipts_customer_idx").on(
      table.customerEmail,
      table.createdAt,
    ),
    index("bank_transfer_receipts_status_idx").on(table.status, table.createdAt),
    uniqueIndex("bank_transfer_receipts_pending_order_unique")
      .on(table.orderId)
      .where(sql`status = 'pending'`),
  ],
);

export const supportTickets = sqliteTable(
  "support_tickets",
  {
    id: text("id").primaryKey(),
    ticketNumber: text("ticket_number").notNull().unique(),
    customerEmail: text("customer_email").notNull(),
    customerName: text("customer_name").notNull(),
    orderId: text("order_id").notNull().default(""),
    subject: text("subject").notNull(),
    category: text("category").notNull().default("other"),
    status: text("status").notNull().default("open"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("support_tickets_customer_idx").on(table.customerEmail, table.updatedAt),
    index("support_tickets_status_idx").on(table.status, table.updatedAt),
    index("support_tickets_order_idx").on(table.orderId),
  ],
);

export const supportMessages = sqliteTable(
  "support_messages",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id").notNull(),
    authorEmail: text("author_email").notNull(),
    authorRole: text("author_role").notNull(),
    body: text("body").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("support_messages_ticket_idx").on(table.ticketId, table.createdAt)],
);

export const productReviews = sqliteTable(
  "product_reviews",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerName: text("customer_name").notNull(),
    orderId: text("order_id").notNull(),
    rating: integer("rating").notNull(),
    title: text("title").notNull().default(""),
    body: text("body").notNull(),
    status: text("status").notNull().default("pending"),
    moderatedBy: text("moderated_by").notNull().default(""),
    moderatedAt: text("moderated_at").notNull().default(""),
    moderationNote: text("moderation_note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("product_reviews_product_status_idx").on(table.productId, table.status, table.createdAt),
    index("product_reviews_customer_idx").on(table.customerEmail, table.createdAt),
    uniqueIndex("product_reviews_customer_product_unique").on(
      table.customerEmail,
      table.productId,
    ),
  ],
);

export const customerNotifications = sqliteTable(
  "customer_notifications",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href").notNull().default("/account"),
    readAt: text("read_at").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("customer_notifications_owner_idx").on(table.ownerEmail, table.createdAt),
    index("customer_notifications_unread_idx").on(table.ownerEmail, table.readAt),
  ],
);

export const requestRateLimits = sqliteTable(
  "request_rate_limits",
  {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(),
    identityHash: text("identity_hash").notNull(),
    windowStart: integer("window_start").notNull(),
    hitCount: integer("hit_count").notNull().default(1),
    blockedCount: integer("blocked_count").notNull().default(0),
    limitValue: integer("limit_value").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("request_rate_limits_window_idx").on(table.windowStart),
    index("request_rate_limits_scope_idx").on(table.scope, table.updatedAt),
  ],
);
