import { randomUUID } from "node:crypto";
import { withPostgresTransaction } from "./database.js";

function fail(message, code = "INVALID_INPUT") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function assert(condition, message, code = "INVALID_INPUT") {
  if (!condition) fail(message, code);
}

function safeHref(value) {
  const href = String(value || "").trim();
  if (!href) return null;
  assert(href.length <= 300, "Link is too long");
  assert(href.startsWith("/") && !href.startsWith("//"), "Only internal links are allowed");
  return href;
}

function safeColor(value, fallback) {
  const color = String(value || fallback).trim().toLowerCase();
  assert(/^#[0-9a-f]{6}$/.test(color), "Color must be a six-digit hex value");
  return color;
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  assert(!Number.isNaN(date.getTime()), "Invalid schedule date");
  return date;
}

function assertDateRange(startsAt, endsAt) {
  if (startsAt && endsAt) assert(endsAt > startsAt, "End time must be after start time");
}

function safeOrder(value, fallback = 0) {
  const number = Number(value ?? fallback);
  assert(Number.isSafeInteger(number) && number >= 0 && number <= 1_000_000, "Invalid sort order");
  return number;
}

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapMessage(row) {
  return {
    id: row.id,
    text: row.text,
    href: row.href,
    backgroundColor: row.background_color,
    textColor: row.text_color,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    visible: Boolean(row.visible),
    sortOrder: Number(row.sort_order || 0),
  };
}

function mapBanner(row) {
  return {
    id: row.id,
    title: row.title,
    href: row.href,
    imageUrl: row.image_url,
    placement: row.placement,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    visible: Boolean(row.visible),
    sortOrder: Number(row.sort_order || 0),
  };
}

function mapSection(row) {
  return {
    key: row.section_key,
    visible: Boolean(row.visible),
    sortOrder: Number(row.sort_order || 0),
  };
}

export class PostgresStorefrontCmsService {
  constructor(pool) {
    this.pool = pool;
  }

  async requireAdmin(actorId, client = this.pool) {
    const result = await client.query(
      "SELECT role,status FROM users WHERE id=$1",
      [actorId],
    );
    const actor = result.rows[0];
    assert(actor && actor.status === "ACTIVE" && actor.role === "ADMIN", "Admin role required", "FORBIDDEN");
  }

  async getPublic(now = new Date()) {
    const [sections, messages, banners] = await Promise.all([
      this.pool.query(
        `SELECT * FROM home_sections
         WHERE visible=TRUE
         ORDER BY sort_order ASC,section_key ASC`,
      ),
      this.pool.query(
        `SELECT * FROM header_messages
         WHERE visible=TRUE
           AND (starts_at IS NULL OR starts_at <= $1)
           AND (ends_at IS NULL OR ends_at >= $1)
         ORDER BY sort_order ASC,created_at ASC`,
        [now],
      ),
      this.pool.query(
        `SELECT * FROM storefront_banners
         WHERE visible=TRUE
           AND (starts_at IS NULL OR starts_at <= $1)
           AND (ends_at IS NULL OR ends_at >= $1)
         ORDER BY sort_order ASC,created_at ASC`,
        [now],
      ),
    ]);
    return {
      sections: sections.rows.map(mapSection),
      headerMessages: messages.rows.map(mapMessage),
      banners: banners.rows.map(mapBanner),
    };
  }

  async getManaged(adminId) {
    await this.requireAdmin(adminId);
    const [sections, messages, banners] = await Promise.all([
      this.pool.query("SELECT * FROM home_sections ORDER BY sort_order ASC,section_key ASC"),
      this.pool.query("SELECT * FROM header_messages ORDER BY sort_order ASC,created_at ASC"),
      this.pool.query("SELECT * FROM storefront_banners ORDER BY sort_order ASC,created_at ASC"),
    ]);
    return {
      sections: sections.rows.map(mapSection),
      headerMessages: messages.rows.map(mapMessage),
      banners: banners.rows.map(mapBanner),
    };
  }

  async messageById(messageId, client = this.pool) {
    const result = await client.query("SELECT * FROM header_messages WHERE id=$1", [messageId]);
    assert(result.rows[0], "Header message not found", "NOT_FOUND");
    return mapMessage(result.rows[0]);
  }

  async bannerById(bannerId, client = this.pool) {
    const result = await client.query("SELECT * FROM storefront_banners WHERE id=$1", [bannerId]);
    assert(result.rows[0], "Banner not found", "NOT_FOUND");
    return mapBanner(result.rows[0]);
  }

  async createHeaderMessage(adminId, input) {
    await this.requireAdmin(adminId);
    const text = String(input.text || "").trim();
    assert(text && text.length <= 160, "Header message text is required");
    const startsAt = safeDate(input.startsAt);
    const endsAt = safeDate(input.endsAt);
    assertDateRange(startsAt, endsAt);
    const inserted = await this.pool.query(
      `INSERT INTO header_messages
       (id,text,href,background_color,text_color,starts_at,ends_at,visible,sort_order)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        randomUUID(),
        text,
        safeHref(input.href),
        safeColor(input.backgroundColor, "#111827"),
        safeColor(input.textColor, "#ffffff"),
        startsAt,
        endsAt,
        input.visible !== false,
        safeOrder(input.sortOrder),
      ],
    );
    await this.audit(this.pool, adminId, "HEADER_MESSAGE_CREATED", "HEADER_MESSAGE", inserted.rows[0].id, {});
    return mapMessage(inserted.rows[0]);
  }

  async updateHeaderMessage(adminId, messageId, input) {
    await this.requireAdmin(adminId);
    return withPostgresTransaction(this.pool, async (client) => {
      const currentResult = await client.query(
        "SELECT * FROM header_messages WHERE id=$1 FOR UPDATE",
        [messageId],
      );
      const current = currentResult.rows[0];
      assert(current, "Header message not found", "NOT_FOUND");
      const text = input.text === undefined ? current.text : String(input.text).trim();
      assert(text && text.length <= 160, "Header message text is required");
      const startsAt = input.startsAt === undefined ? current.starts_at : safeDate(input.startsAt);
      const endsAt = input.endsAt === undefined ? current.ends_at : safeDate(input.endsAt);
      assertDateRange(startsAt, endsAt);
      const updated = await client.query(
        `UPDATE header_messages
         SET text=$1,href=$2,background_color=$3,text_color=$4,starts_at=$5,ends_at=$6,
             visible=$7,sort_order=$8,updated_at=CURRENT_TIMESTAMP
         WHERE id=$9 RETURNING *`,
        [
          text,
          input.href === undefined ? current.href : safeHref(input.href),
          input.backgroundColor === undefined
            ? current.background_color
            : safeColor(input.backgroundColor, current.background_color),
          input.textColor === undefined
            ? current.text_color
            : safeColor(input.textColor, current.text_color),
          startsAt,
          endsAt,
          input.visible === undefined ? current.visible : Boolean(input.visible),
          input.sortOrder === undefined ? Number(current.sort_order) : safeOrder(input.sortOrder),
          messageId,
        ],
      );
      await this.audit(client, adminId, "HEADER_MESSAGE_UPDATED", "HEADER_MESSAGE", messageId, {});
      return mapMessage(updated.rows[0]);
    });
  }

  async deleteHeaderMessage(adminId, messageId) {
    await this.requireAdmin(adminId);
    const deleted = await this.pool.query(
      "DELETE FROM header_messages WHERE id=$1 RETURNING id",
      [messageId],
    );
    assert(deleted.rows[0], "Header message not found", "NOT_FOUND");
    await this.audit(this.pool, adminId, "HEADER_MESSAGE_DELETED", "HEADER_MESSAGE", messageId, {});
    return { deleted: true, id: messageId };
  }

  async createBanner(adminId, input) {
    await this.requireAdmin(adminId);
    const title = String(input.title || "").trim();
    assert(title && title.length <= 160, "Banner title is required");
    const placement = String(input.placement || "SMALL").toUpperCase();
    assert(["TOP", "HERO", "SMALL"].includes(placement), "Invalid banner placement");
    const startsAt = safeDate(input.startsAt);
    const endsAt = safeDate(input.endsAt);
    assertDateRange(startsAt, endsAt);
    const inserted = await this.pool.query(
      `INSERT INTO storefront_banners
       (id,title,href,image_url,placement,visible,sort_order,starts_at,ends_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        randomUUID(),
        title,
        safeHref(input.href),
        input.imageUrl ? validateImageUrl(input.imageUrl) : null,
        placement,
        input.visible !== false,
        safeOrder(input.sortOrder),
        startsAt,
        endsAt,
      ],
    );
    await this.audit(this.pool, adminId, "BANNER_CREATED", "BANNER", inserted.rows[0].id, {});
    return mapBanner(inserted.rows[0]);
  }

  async updateBanner(adminId, bannerId, input) {
    await this.requireAdmin(adminId);
    return withPostgresTransaction(this.pool, async (client) => {
      const currentResult = await client.query(
        "SELECT * FROM storefront_banners WHERE id=$1 FOR UPDATE",
        [bannerId],
      );
      const current = currentResult.rows[0];
      assert(current, "Banner not found", "NOT_FOUND");
      const title = input.title === undefined ? current.title : String(input.title).trim();
      assert(title && title.length <= 160, "Banner title is required");
      const placement = input.placement === undefined
        ? current.placement
        : String(input.placement).toUpperCase();
      assert(["TOP", "HERO", "SMALL"].includes(placement), "Invalid banner placement");
      const startsAt = input.startsAt === undefined ? current.starts_at : safeDate(input.startsAt);
      const endsAt = input.endsAt === undefined ? current.ends_at : safeDate(input.endsAt);
      assertDateRange(startsAt, endsAt);
      const updated = await client.query(
        `UPDATE storefront_banners
         SET title=$1,href=$2,image_url=$3,placement=$4,visible=$5,sort_order=$6,
             starts_at=$7,ends_at=$8,updated_at=CURRENT_TIMESTAMP
         WHERE id=$9 RETURNING *`,
        [
          title,
          input.href === undefined ? current.href : safeHref(input.href),
          input.imageUrl === undefined ? current.image_url : validateImageUrl(input.imageUrl),
          placement,
          input.visible === undefined ? current.visible : Boolean(input.visible),
          input.sortOrder === undefined ? Number(current.sort_order) : safeOrder(input.sortOrder),
          startsAt,
          endsAt,
          bannerId,
        ],
      );
      await this.audit(client, adminId, "BANNER_UPDATED", "BANNER", bannerId, {});
      return mapBanner(updated.rows[0]);
    });
  }

  async deleteBanner(adminId, bannerId) {
    await this.requireAdmin(adminId);
    const deleted = await this.pool.query(
      "DELETE FROM storefront_banners WHERE id=$1 RETURNING id",
      [bannerId],
    );
    assert(deleted.rows[0], "Banner not found", "NOT_FOUND");
    await this.audit(this.pool, adminId, "BANNER_DELETED", "BANNER", bannerId, {});
    return { deleted: true, id: bannerId };
  }

  async updateSection(adminId, sectionKey, input) {
    await this.requireAdmin(adminId);
    const current = await this.pool.query(
      "SELECT * FROM home_sections WHERE section_key=$1",
      [sectionKey],
    );
    assert(current.rows[0], "Home section not found", "NOT_FOUND");
    const updated = await this.pool.query(
      `UPDATE home_sections
       SET visible=$1,sort_order=$2,updated_at=CURRENT_TIMESTAMP
       WHERE section_key=$3 RETURNING *`,
      [
        input.visible === undefined ? current.rows[0].visible : Boolean(input.visible),
        input.sortOrder === undefined
          ? Number(current.rows[0].sort_order)
          : safeOrder(input.sortOrder),
        sectionKey,
      ],
    );
    await this.audit(this.pool, adminId, "HOME_SECTION_UPDATED", "HOME_SECTION", sectionKey, {});
    return mapSection(updated.rows[0]);
  }

  async audit(client, actorId, action, entityType, entityId, details = {}) {
    await client.query(
      `INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,details_json)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), actorId, action, entityType, entityId, JSON.stringify(details)],
    );
  }
}

function validateImageUrl(value) {
  const url = String(value || "").trim();
  if (!url) return null;
  assert(url.length <= 1000, "Banner image URL is too long");
  assert(/^https:\/\//i.test(url), "Banner image URL must use HTTPS");
  return url;
}
