"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Container } from "@miran/ui";
import styles from "./real-product-manager.module.css";

type ManagedCategory = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  imageUrl: string | null;
  sortOrder: number;
  visible: boolean;
  childCount: number;
  productCount: number;
};

export function RealCategoryManager() {
  const [categories, setCategories] = useState<ManagedCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/categories", { cache: "no-store" });
      const data = (await response.json()) as { categories?: ManagedCategory[]; message?: string };
      if (!response.ok || !data.categories) {
        setMessage(data.message ?? "دریافت دسته‌بندی‌ها انجام نشد.");
        return;
      }
      setCategories(data.categories);
    } catch {
      setMessage("ارتباط با Backend دسته‌بندی برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: String(data.get("name") || "").trim(),
          slug: String(data.get("slug") || "").trim().toLowerCase(),
          parentId: String(data.get("parentId") || "") || null,
          imageUrl: String(data.get("imageUrl") || "").trim() || null,
          sortOrder: Number(data.get("sortOrder") || 0),
          visible: true,
        }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "ساخت دسته‌بندی انجام نشد.");
        return;
      }
      form.reset();
      setMessage("دسته‌بندی در Database ساخته شد.");
      await load();
    } catch {
      setMessage("ساخت دسته‌بندی انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  async function patch(id: string, data: Record<string, unknown>) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/categories", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, data }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "به‌روزرسانی دسته‌بندی انجام نشد.");
        return;
      }
      await load();
      setMessage("دسته‌بندی به‌روزرسانی شد.");
    } catch {
      setMessage("به‌روزرسانی دسته‌بندی انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  async function remove(category: ManagedCategory) {
    if (category.childCount > 0 || category.productCount > 0) {
      setMessage("این دسته وابستگی دارد؛ ابتدا زیر‌دسته‌ها یا محصولات آن را جابه‌جا کنید.");
      return;
    }
    if (!window.confirm(`حذف دسته «${category.name}»؟`)) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/categories", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: category.id }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "حذف دسته‌بندی انجام نشد.");
        return;
      }
      await load();
      setMessage("دسته‌بندی حذف شد.");
    } catch {
      setMessage("حذف دسته‌بندی انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  const parents = categories.filter((category) => category.parentId === null);

  return (
    <section className={styles.section} aria-labelledby="real-categories-title">
      <Container size="wide">
        <div className={styles.panel}>
          <div className={styles.heading}>
            <p>Database-backed Categories</p>
            <h2 id="real-categories-title">دسته‌بندی‌های واقعی</h2>
            <p className={styles.note}>
              دسته مادر و زیر‌دسته مستقیماً در Database ذخیره می‌شوند. حذف دسته‌ای که محصول یا زیر‌دسته دارد عمداً مسدود است.
            </p>
          </div>
          <div className={styles.grid}>
            <form className={styles.form} onSubmit={createCategory}>
              <h3>دسته جدید</h3>
              <label>نام<input name="name" maxLength={120} required /></label>
              <label>Slug<input name="slug" pattern="[A-Za-z0-9-]+" dir="ltr" required /></label>
              <label>
                دسته مادر
                <select name="parentId" defaultValue="">
                  <option value="">بدون والد — دسته مادر</option>
                  {parents.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label>آدرس تصویر<input name="imageUrl" dir="ltr" placeholder="/media/category.webp" /></label>
              <label>ترتیب نمایش<input name="sortOrder" type="number" min="0" step="1" defaultValue="0" /></label>
              <button type="submit" disabled={loading}>ساخت دسته در Database</button>
            </form>
            <div>
              <h3>ساختار دسته‌ها</h3>
              {loading && categories.length === 0 ? <p role="status">در حال دریافت…</p> : null}
              {!loading && categories.length === 0 ? <p>هنوز دسته واقعی ثبت نشده است.</p> : null}
              {categories.map((category) => (
                <article className={styles.card} key={category.id}>
                  <h3>{category.parentId ? `↳ ${category.name}` : category.name}</h3>
                  <p className={styles.meta}>{category.slug}</p>
                  <p className={styles.meta}>
                    {category.childCount.toLocaleString("fa-IR")} زیر‌دسته — {category.productCount.toLocaleString("fa-IR")} محصول
                  </p>
                  <div className={styles.actions}>
                    <button type="button" disabled={loading} onClick={() => void patch(category.id, { visible: !category.visible })}>
                      {category.visible ? "مخفی کردن" : "نمایش"}
                    </button>
                    <input
                      aria-label={`ترتیب ${category.name}`}
                      type="number"
                      min="0"
                      step="1"
                      defaultValue={category.sortOrder}
                      onBlur={(event) => {
                        const value = Number(event.currentTarget.value);
                        if (Number.isSafeInteger(value) && value !== category.sortOrder) void patch(category.id, { sortOrder: value });
                      }}
                    />
                    <button type="button" disabled={loading || category.childCount > 0 || category.productCount > 0} onClick={() => void remove(category)}>
                      حذف امن
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </div>
      </Container>
    </section>
  );
}
