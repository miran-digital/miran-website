"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Container } from "@miran/ui";
import type { CatalogCategory } from "@/features/catalog/catalog-gateway";
import {
  getSellerApplications,
  subscribeToSellerApplications,
  updateSellerApplicationStatus,
  type SellerApplication,
} from "@/features/seller/seller-applications";
import {
  adminSectionLabels,
  createAdminId,
  createDefaultAdminState,
  getAdminState,
  normalizeAdminHref,
  saveAdminState,
  subscribeToAdminState,
  type AdminSectionKey,
  type AdminState,
} from "./admin-store";
import styles from "./admin.module.css";

type AdminTab = "overview" | "content" | "products" | "sellers";

export function AdminPage({
  categories,
}: {
  categories: readonly CatalogCategory[];
}) {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [state, setState] = useState<AdminState>(createDefaultAdminState);
  const [sellers, setSellers] = useState<SellerApplication[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState("");
  const [productImage, setProductImage] = useState("");
  const [imageError, setImageError] = useState("");

  useEffect(() => {
    const sync = () => setState(getAdminState());
    sync();
    return subscribeToAdminState(sync);
  }, []);

  useEffect(() => {
    const sync = () => setSellers(getSellerApplications());
    sync();
    return subscribeToSellerApplications(sync);
  }, []);

  const selectedSeller = useMemo(
    () =>
      sellers.find((seller) => seller.id === selectedSellerId) ?? sellers[0],
    [selectedSellerId, sellers],
  );

  function commit(next: AdminState) {
    setState(saveAdminState(next));
  }

  function toggleSection(section: AdminSectionKey) {
    commit({
      ...state,
      sections: { ...state.sections, [section]: !state.sections[section] },
    });
  }

  function toggleCategory(categoryId: string) {
    const hiddenCategoryIds = state.hiddenCategoryIds.includes(categoryId)
      ? state.hiddenCategoryIds.filter((id) => id !== categoryId)
      : [...state.hiddenCategoryIds, categoryId];
    commit({ ...state, hiddenCategoryIds });
  }

  function addHeaderMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.headerMessages.length >= 10) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = String(data.get("text") ?? "").trim();
    if (!text) return;
    commit({
      ...state,
      headerMessages: [
        ...state.headerMessages,
        {
          id: createAdminId("message"),
          text: text.slice(0, 160),
          href: normalizeAdminHref(String(data.get("href") ?? "")),
          startsAt: String(data.get("startsAt") ?? ""),
          endsAt: String(data.get("endsAt") ?? ""),
          visible: true,
        },
      ],
    });
    form.reset();
  }

  function addBanner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    if (!title) return;
    commit({
      ...state,
      banners: [
        ...state.banners,
        {
          id: createAdminId("banner"),
          title: title.slice(0, 160),
          href: normalizeAdminHref(String(data.get("href") ?? "")),
          visible: true,
        },
      ],
    });
    form.reset();
  }

  function readProductImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setImageError("");
    if (!file) {
      setProductImage("");
      return;
    }
    const supportedTypes = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif",
      "image/gif",
    ]);
    if (!supportedTypes.has(file.type) || file.size > 1_000_000) {
      setProductImage("");
      setImageError("فقط تصویر با حجم حداکثر ۱ مگابایت پذیرفته می‌شود.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setProductImage(String(reader.result ?? ""));
    reader.onerror = () => setImageError("خواندن تصویر ممکن نشد.");
    reader.readAsDataURL(file);
  }

  function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const slug = String(data.get("slug") ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const price = Number(data.get("price"));
    if (!title || !slug || !Number.isFinite(price) || price < 0) return;
    commit({
      ...state,
      products: [
        {
          id: createAdminId("product"),
          title: title.slice(0, 180),
          slug,
          brand: String(data.get("brand") ?? "")
            .trim()
            .slice(0, 100),
          category: String(data.get("category") ?? "")
            .trim()
            .slice(0, 100),
          priceMinor: Math.round(price * 100),
          imageDataUrl: productImage,
          visible: true,
        },
        ...state.products,
      ].slice(0, 20),
    });
    form.reset();
    setProductImage("");
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Container size="wide" className={styles.topbarInner}>
          <div>
            <span>Miran Shop</span>
            <strong>Admin Preview</strong>
          </div>
          <a href="/">مشاهده فروشگاه</a>
        </Container>
      </header>
      <Container size="wide">
        <div className={styles.securityNotice} role="alert">
          این پنل فقط Preview محلی است؛ پیش از انتشار باید پشت Identity Service،
          نشست امن و نقش مدیر قرار گیرد. هیچ لینک عمومی به این صفحه وجود ندارد.
        </div>
        <div className={styles.layout}>
          <nav className={styles.sidebar} aria-label="بخش‌های مدیریت">
            {(
              [
                ["overview", "نمای کلی"],
                ["content", "محتوا و نمایش"],
                ["products", "محصولات"],
                ["sellers", "فروشندگان"],
              ] as const
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
                <div className={styles.heading}>
                  <p>Dashboard</p>
                  <h1 id="admin-overview-title">نمای کلی مدیریت</h1>
                </div>
                <div className={styles.stats}>
                  <article>
                    <span>بخش‌های فعال Home</span>
                    <strong>
                      {Object.values(state.sections)
                        .filter(Boolean)
                        .length.toLocaleString("fa-IR")}
                    </strong>
                  </article>
                  <article>
                    <span>پیام‌های Header</span>
                    <strong>
                      {state.headerMessages.length.toLocaleString("fa-IR")}
                    </strong>
                  </article>
                  <article>
                    <span>محصولات آزمایشی</span>
                    <strong>
                      {state.products.length.toLocaleString("fa-IR")}
                    </strong>
                  </article>
                  <article>
                    <span>درخواست فروشنده</span>
                    <strong>{sellers.length.toLocaleString("fa-IR")}</strong>
                  </article>
                </div>
              </section>
            ) : null}

            {tab === "content" ? (
              <section className={styles.stack} aria-labelledby="content-title">
                <div className={styles.heading}>
                  <p>Storefront CMS Preview</p>
                  <h1 id="content-title">محتوا و نمایش</h1>
                </div>
                <article className={styles.card}>
                  <h2>نمایش بخش‌های Home</h2>
                  <p>
                    هیچ بخشی خودکار مخفی نمی‌شود؛ مدیر وضعیت را تعیین می‌کند.
                  </p>
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

                <article className={styles.card}>
                  <h2>نمایش دسته‌بندی‌ها</h2>
                  <p>
                    هر دسته به‌صورت مستقل در Home قابل نمایش یا مخفی‌سازی است.
                  </p>
                  <div className={styles.toggleGrid}>
                    {categories.map((category) => (
                      <label key={category.slug}>
                        <input
                          type="checkbox"
                          checked={
                            !state.hiddenCategoryIds.includes(category.slug)
                          }
                          onChange={() => toggleCategory(category.slug)}
                        />
                        {category.name}
                      </label>
                    ))}
                  </div>
                </article>

                <article className={styles.card}>
                  <h2>پیام‌های Header</h2>
                  <p>حداکثر ۱۰ پیام با لینک و بازه زمانی.</p>
                  <form
                    className={styles.inlineForm}
                    onSubmit={addHeaderMessage}
                  >
                    <input
                      name="text"
                      aria-label="متن پیام Header"
                      required
                      maxLength={160}
                      placeholder="متن پیام"
                    />
                    <input
                      name="href"
                      aria-label="لینک پیام Header"
                      maxLength={300}
                      placeholder="لینک مثل /offers"
                      dir="ltr"
                    />
                    <input
                      name="startsAt"
                      type="datetime-local"
                      aria-label="زمان شروع نمایش پیام"
                    />
                    <input
                      name="endsAt"
                      type="datetime-local"
                      aria-label="زمان پایان نمایش پیام"
                    />
                    <button
                      type="submit"
                      disabled={state.headerMessages.length >= 10}
                    >
                      افزودن پیام
                    </button>
                  </form>
                  <div className={styles.list}>
                    {state.headerMessages.map((message) => (
                      <div key={message.id}>
                        <span>{message.text}</span>
                        <label>
                          <input
                            type="checkbox"
                            checked={message.visible}
                            onChange={() =>
                              commit({
                                ...state,
                                headerMessages: state.headerMessages.map(
                                  (item) =>
                                    item.id === message.id
                                      ? { ...item, visible: !item.visible }
                                      : item,
                                ),
                              })
                            }
                          />
                          نمایش
                        </label>
                      </div>
                    ))}
                  </div>
                </article>

                <article className={styles.card}>
                  <h2>اسلایدرها و بنرها</h2>
                  <form className={styles.inlineForm} onSubmit={addBanner}>
                    <input
                      name="title"
                      aria-label="عنوان بنر"
                      required
                      maxLength={160}
                      placeholder="عنوان بنر"
                    />
                    <input
                      name="href"
                      aria-label="لینک مقصد بنر"
                      maxLength={300}
                      placeholder="لینک مقصد"
                      dir="ltr"
                    />
                    <button type="submit">افزودن بنر</button>
                  </form>
                  <div className={styles.list}>
                    {state.banners.length === 0 ? (
                      <p>هنوز بنری ساخته نشده است.</p>
                    ) : null}
                    {state.banners.map((banner) => (
                      <div key={banner.id}>
                        <span>{banner.title}</span>
                        <label>
                          <input
                            type="checkbox"
                            checked={banner.visible}
                            onChange={() =>
                              commit({
                                ...state,
                                banners: state.banners.map((item) =>
                                  item.id === banner.id
                                    ? { ...item, visible: !item.visible }
                                    : item,
                                ),
                              })
                            }
                          />
                          نمایش
                        </label>
                      </div>
                    ))}
                  </div>
                </article>

                <article className={styles.card}>
                  <h2>ردیف‌های محصول</h2>
                  <div className={styles.list}>
                    {state.productRows.map((row) => (
                      <div key={row.id}>
                        <span>{row.title}</span>
                        <label>
                          <input
                            type="checkbox"
                            checked={row.visible}
                            onChange={() =>
                              commit({
                                ...state,
                                productRows: state.productRows.map((item) =>
                                  item.id === row.id
                                    ? { ...item, visible: !item.visible }
                                    : item,
                                ),
                              })
                            }
                          />
                          نمایش
                        </label>
                        <label>
                          تعداد
                          <input
                            type="number"
                            min={1}
                            max={24}
                            value={row.itemLimit}
                            onChange={(event) =>
                              commit({
                                ...state,
                                productRows: state.productRows.map((item) =>
                                  item.id === row.id
                                    ? {
                                        ...item,
                                        itemLimit: Math.max(
                                          1,
                                          Math.min(
                                            24,
                                            Number(event.target.value) || 1,
                                          ),
                                        ),
                                      }
                                    : item,
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </article>
              </section>
            ) : null}

            {tab === "products" ? (
              <section aria-labelledby="products-title">
                <div className={styles.heading}>
                  <p>Catalog Preview</p>
                  <h1 id="products-title">مدیریت محصولات</h1>
                </div>
                <div className={styles.productWorkspace}>
                  <form className={styles.productForm} onSubmit={addProduct}>
                    <h2>محصول جدید</h2>
                    <label>
                      عنوان
                      <input name="title" required maxLength={180} />
                    </label>
                    <label>
                      Slug
                      <input
                        name="slug"
                        required
                        pattern="[A-Za-z0-9-]+"
                        dir="ltr"
                      />
                    </label>
                    <label>
                      برند
                      <input name="brand" required maxLength={100} />
                    </label>
                    <label>
                      دسته‌بندی
                      <select name="category" required defaultValue="">
                        <option value="" disabled>
                          انتخاب کنید
                        </option>
                        {categories.map((category) => (
                          <option key={category.slug} value={category.slug}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      قیمت (£)
                      <input
                        name="price"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                      />
                    </label>
                    <label>
                      تصویر
                      <input
                        type="file"
                        accept="image/*"
                        onChange={readProductImage}
                      />
                    </label>
                    {imageError ? (
                      <p className={styles.error}>{imageError}</p>
                    ) : null}
                    {productImage ? (
                      <img
                        className={styles.imagePreview}
                        src={productImage}
                        alt="پیش‌نمایش محصول"
                      />
                    ) : null}
                    <button type="submit">ساخت محصول آزمایشی</button>
                  </form>
                  <div className={styles.productList}>
                    <h2>فهرست محصولات آزمایشی</h2>
                    {state.products.length === 0 ? (
                      <p>هنوز محصولی ساخته نشده است.</p>
                    ) : null}
                    {state.products.map((product) => (
                      <article key={product.id}>
                        {product.imageDataUrl ? (
                          <img src={product.imageDataUrl} alt={product.title} />
                        ) : (
                          <span>بدون تصویر</span>
                        )}
                        <div>
                          <strong>{product.title}</strong>
                          <small>
                            {product.brand} · {product.category}
                          </small>
                        </div>
                        <label>
                          <input
                            type="checkbox"
                            checked={product.visible}
                            onChange={() =>
                              commit({
                                ...state,
                                products: state.products.map((item) =>
                                  item.id === product.id
                                    ? { ...item, visible: !item.visible }
                                    : item,
                                ),
                              })
                            }
                          />
                          نمایش
                        </label>
                      </article>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {tab === "sellers" ? (
              <section aria-labelledby="sellers-title">
                <div className={styles.heading}>
                  <p>Marketplace</p>
                  <h1 id="sellers-title">درخواست‌های فروشندگی</h1>
                </div>
                <div className={styles.sellerWorkspace}>
                  <div className={styles.sellerList}>
                    {sellers.length === 0 ? (
                      <p>درخواستی روی این دستگاه ثبت نشده است.</p>
                    ) : null}
                    {sellers.map((seller) => (
                      <button
                        key={seller.id}
                        type="button"
                        data-active={seller.id === selectedSeller?.id}
                        onClick={() => setSelectedSellerId(seller.id)}
                      >
                        <strong>{seller.storeName}</strong>
                        <span>
                          {seller.contactName} · {seller.status}
                        </span>
                      </button>
                    ))}
                  </div>
                  <article className={styles.sellerDetail}>
                    {selectedSeller ? (
                      <>
                        <h2>{selectedSeller.storeName}</h2>
                        <dl>
                          <div>
                            <dt>مسئول</dt>
                            <dd>{selectedSeller.contactName}</dd>
                          </div>
                          <div>
                            <dt>ایمیل</dt>
                            <dd dir="ltr">{selectedSeller.email}</dd>
                          </div>
                          <div>
                            <dt>تماس</dt>
                            <dd dir="ltr">{selectedSeller.phone}</dd>
                          </div>
                          <div>
                            <dt>دسته</dt>
                            <dd>{selectedSeller.category}</dd>
                          </div>
                        </dl>
                        <p>{selectedSeller.notes || "بدون توضیحات"}</p>
                        <label>
                          وضعیت
                          <select
                            value={selectedSeller.status}
                            onChange={(event) => {
                              updateSellerApplicationStatus(
                                selectedSeller.id,
                                event.target
                                  .value as SellerApplication["status"],
                              );
                              setSellers(getSellerApplications());
                            }}
                          >
                            <option value="new">جدید</option>
                            <option value="reviewing">در حال بررسی</option>
                            <option value="approved">تاییدشده</option>
                            <option value="rejected">ردشده</option>
                          </select>
                        </label>
                      </>
                    ) : (
                      <p>یک درخواست را انتخاب کنید.</p>
                    )}
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
