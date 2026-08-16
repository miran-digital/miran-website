import { randomUUID } from "node:crypto";

function fail(message, code = "INVALID_INPUT") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function requireAdmin(db, actorId) {
  const actor = db.prepare("SELECT id,role,status FROM users WHERE id=?").get(actorId);
  if (!actor || actor.status !== "ACTIVE" || actor.role !== "ADMIN") {
    fail("Admin role required", "FORBIDDEN");
  }
}

function color(value, fallback) {
  const text = String(value || fallback).trim();
  if (!/^#[0-9a-f]{6}$/i.test(text)) fail("Color must be a six-digit hex value");
  return text.toLowerCase();
}

function href(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.startsWith("/") && !text.startsWith("//")) return text.slice(0, 1000);
  if (/^https:\/\//i.test(text)) return text.slice(0, 1000);
  fail("Link must be an internal path or HTTPS URL");
}

function mediaUrl(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.startsWith("/") && !text.startsWith("//")) return text.slice(0, 1000);
  if (/^https:\/\//i.test(text)) return text.slice(0, 1000);
  fail("Image URL must be an internal path or HTTPS URL");
}

function schedule(startValue, endValue) {
  const start = startValue ? new Date(startValue) : null;
  const end = endValue ? new Date(endValue) : null;
  if (start && Number.isNaN(start.getTime())) fail("Invalid start time");
  if (end && Number.isNaN(end.getTime())) fail("Invalid end time");
  if (start && end && end <= start) fail("End time must be after start time");
  return {
    startsAt: start ? start.toISOString() : null,
    endsAt: end ? end.toISOString() : null,
  };
}

function sortOrder(value) {
  const parsed = Number(value || 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 1_000_000) {
    fail("Invalid sort order");
  }
  return parsed;
}

export class StorefrontCmsService {
  constructor(db) {
    this.db = db;
  }

  getPublic(now = new Date()) {
    const nowIso = now.toISOString();
    const headerMessages = this.db.prepare(
      `SELECT * FROM header_messages
       WHERE visible=1
         AND (starts_at IS NULL OR starts_at<=?)
         AND (ends_at IS NULL OR ends_at>?)
       ORDER BY sort_order ASC,created_at ASC`,
    ).all(nowIso, nowIso).map(this.toHeaderMessage);

    const banners = this.db.prepare(
      `SELECT * FROM storefront_banners
       WHERE visible=1
         AND (starts_at IS NULL OR starts_at<=?)
         AND (ends_at IS NULL OR ends_at>?)
       ORDER BY placement ASC,sort_order ASC,created_at ASC`,
    ).all(nowIso, nowIso).map(this.toBanner);

    const sections = this.db.prepare(
      "SELECT section_key,visible,sort_order FROM home_sections ORDER BY sort_order ASC,section_key ASC",
    ).all().map((row) => ({
      key: row.section_key,
      visible: Boolean(row.visible),
      sortOrder: Number(row.sort_order),
    }));

    return { headerMessages, banners, sections };
  }

  getManaged(actorId) {
    requireAdmin(this.db, actorId);
    return {
      headerMessages: this.db.prepare("SELECT * FROM header_messages ORDER BY sort_order ASC,created_at ASC").all().map(this.toHeaderMessage),
      banners: this.db.prepare("SELECT * FROM storefront_banners ORDER BY placement ASC,sort_order ASC,created_at ASC").all().map(this.toBanner),
      sections: this.db.prepare("SELECT section_key,visible,sort_order FROM home_sections ORDER BY sort_order ASC,section_key ASC").all().map((row) => ({
        key: row.section_key,
        visible: Boolean(row.visible),
        sortOrder: Number(row.sort_order),
      })),
    };
  }

  createHeaderMessage(actorId, input) {
    requireAdmin(this.db, actorId);
    const text = String(input.text || "").trim();
    if (!text || text.length > 200) fail("Header message text is required");
    const timing = schedule(input.startsAt, input.endsAt);
    const id = randomUUID();
    this.db.prepare(
      `INSERT INTO header_messages
       (id,text,href,background_color,text_color,starts_at,ends_at,visible,sort_order)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      text,
      href(input.href),
      color(input.backgroundColor, "#111827"),
      color(input.textColor, "#ffffff"),
      timing.startsAt,
      timing.endsAt,
      input.visible === false ? 0 : 1,
      sortOrder(input.sortOrder),
    );
    this.audit(actorId, "HEADER_MESSAGE_CREATED", "HEADER_MESSAGE", id, {});
    return this.headerById(id);
  }

  updateHeaderMessage(actorId, id, input) {
    requireAdmin(this.db, actorId);
    const current = this.headerById(id);
    const timing = schedule(
      input.startsAt === undefined ? current.startsAt : input.startsAt,
      input.endsAt === undefined ? current.endsAt : input.endsAt,
    );
    const text = input.text === undefined ? current.text : String(input.text || "").trim();
    if (!text || text.length > 200) fail("Header message text is required");
    this.db.prepare(
      `UPDATE header_messages SET text=?,href=?,background_color=?,text_color=?,starts_at=?,ends_at=?,visible=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    ).run(
      text,
      input.href === undefined ? current.href : href(input.href),
      input.backgroundColor === undefined ? current.backgroundColor : color(input.backgroundColor, current.backgroundColor),
      input.textColor === undefined ? current.textColor : color(input.textColor, current.textColor),
      timing.startsAt,
      timing.endsAt,
      input.visible === undefined ? (current.visible ? 1 : 0) : input.visible ? 1 : 0,
      input.sortOrder === undefined ? current.sortOrder : sortOrder(input.sortOrder),
      id,
    );
    this.audit(actorId, "HEADER_MESSAGE_UPDATED", "HEADER_MESSAGE", id, {});
    return this.headerById(id);
  }

  deleteHeaderMessage(actorId, id) {
    requireAdmin(this.db, actorId);
    this.headerById(id);
    this.db.prepare("DELETE FROM header_messages WHERE id=?").run(id);
    this.audit(actorId, "HEADER_MESSAGE_DELETED", "HEADER_MESSAGE", id, {});
    return { deleted: true, id };
  }

  createBanner(actorId, input) {
    requireAdmin(this.db, actorId);
    const title = String(input.title || "").trim();
    if (!title || title.length > 200) fail("Banner title is required");
    const placement = String(input.placement || "SMALL").toUpperCase();
    if (!["TOP", "HERO", "SMALL"].includes(placement)) fail("Invalid banner placement");
    const timing = schedule(input.startsAt, input.endsAt);
    const id = randomUUID();
    this.db.prepare(
      `INSERT INTO storefront_banners
       (id,title,href,image_url,placement,visible,sort_order,starts_at,ends_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      title,
      href(input.href),
      mediaUrl(input.imageUrl),
      placement,
      input.visible === false ? 0 : 1,
      sortOrder(input.sortOrder),
      timing.startsAt,
      timing.endsAt,
    );
    this.audit(actorId, "BANNER_CREATED", "BANNER", id, {});
    return this.bannerById(id);
  }

  updateBanner(actorId, id, input) {
    requireAdmin(this.db, actorId);
    const current = this.bannerById(id);
    const placement = input.placement === undefined ? current.placement : String(input.placement).toUpperCase();
    if (!["TOP", "HERO", "SMALL"].includes(placement)) fail("Invalid banner placement");
    const timing = schedule(
      input.startsAt === undefined ? current.startsAt : input.startsAt,
      input.endsAt === undefined ? current.endsAt : input.endsAt,
    );
    const title = input.title === undefined ? current.title : String(input.title || "").trim();
    if (!title || title.length > 200) fail("Banner title is required");
    this.db.prepare(
      `UPDATE storefront_banners SET title=?,href=?,image_url=?,placement=?,visible=?,sort_order=?,starts_at=?,ends_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    ).run(
      title,
      input.href === undefined ? current.href : href(input.href),
      input.imageUrl === undefined ? current.imageUrl : mediaUrl(input.imageUrl),
      placement,
      input.visible === undefined ? (current.visible ? 1 : 0) : input.visible ? 1 : 0,
      input.sortOrder === undefined ? current.sortOrder : sortOrder(input.sortOrder),
      timing.startsAt,
      timing.endsAt,
      id,
    );
    this.audit(actorId, "BANNER_UPDATED", "BANNER", id, {});
    return this.bannerById(id);
  }

  deleteBanner(actorId, id) {
    requireAdmin(this.db, actorId);
    this.bannerById(id);
    this.db.prepare("DELETE FROM storefront_banners WHERE id=?").run(id);
    this.audit(actorId, "BANNER_DELETED", "BANNER", id, {});
    return { deleted: true, id };
  }

  updateSection(actorId, key, input) {
    requireAdmin(this.db, actorId);
    const sectionKey = String(key || "").trim();
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,80}$/.test(sectionKey)) fail("Invalid section key");
    const current = this.db.prepare("SELECT * FROM home_sections WHERE section_key=?").get(sectionKey);
    const visible = input.visible === undefined ? (current ? Boolean(current.visible) : true) : Boolean(input.visible);
    const order = input.sortOrder === undefined ? Number(current?.sort_order || 0) : sortOrder(input.sortOrder);
    this.db.prepare(
      `INSERT INTO home_sections(section_key,visible,sort_order,updated_at)
       VALUES (?,?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(section_key) DO UPDATE SET visible=excluded.visible,sort_order=excluded.sort_order,updated_at=CURRENT_TIMESTAMP`,
    ).run(sectionKey, visible ? 1 : 0, order);
    this.audit(actorId, "HOME_SECTION_UPDATED", "HOME_SECTION", sectionKey, { visible, sortOrder: order });
    return { key: sectionKey, visible, sortOrder: order };
  }

  headerById(id) {
    const row = this.db.prepare("SELECT * FROM header_messages WHERE id=?").get(id);
    if (!row) fail("Header message not found", "NOT_FOUND");
    return this.toHeaderMessage(row);
  }

  bannerById(id) {
    const row = this.db.prepare("SELECT * FROM storefront_banners WHERE id=?").get(id);
    if (!row) fail("Banner not found", "NOT_FOUND");
    return this.toBanner(row);
  }

  toHeaderMessage(row) {
    return {
      id: row.id,
      text: row.text,
      href: row.href,
      backgroundColor: row.background_color,
      textColor: row.text_color,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      visible: Boolean(row.visible),
      sortOrder: Number(row.sort_order || 0),
    };
  }

  toBanner(row) {
    return {
      id: row.id,
      title: row.title,
      href: row.href,
      imageUrl: row.image_url,
      placement: row.placement,
      visible: Boolean(row.visible),
      sortOrder: Number(row.sort_order || 0),
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    };
  }

  audit(actorUserId, action, entityType, entityId, details) {
    this.db.prepare(
      "INSERT INTO audit_log (id,actor_user_id,action,entity_type,entity_id,details_json) VALUES (?,?,?,?,?,?)",
    ).run(randomUUID(), actorUserId, action, entityType, entityId, JSON.stringify(details));
  }
}
