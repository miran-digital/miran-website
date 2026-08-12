"use client";

import { useState } from "react";
import type { CatalogProductMedia } from "./catalog-gateway";
import styles from "./product-detail.module.css";

type ProductGalleryProps = {
  items: readonly CatalogProductMedia[];
  mediaLabel: string;
};

export function ProductGallery({ items, mediaLabel }: ProductGalleryProps) {
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  const selected = items.find((item) => item.id === selectedId) ?? items[0];

  return (
    <section className={styles.gallery} aria-label="تصاویر محصول">
      <div
        className={styles.galleryMain}
        role="img"
        aria-label={selected?.label}
      >
        <span>{mediaLabel}</span>
        <small>{selected?.label}</small>
      </div>
      <div className={styles.thumbnails} aria-label="انتخاب نمای محصول">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={styles.thumbnail}
            aria-pressed={item.id === selected?.id}
            aria-label={`نمای ${index + 1}: ${item.label}`}
            onClick={() => setSelectedId(item.id)}
          >
            <span>{mediaLabel}</span>
            <small>{(index + 1).toLocaleString("fa-IR")}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
