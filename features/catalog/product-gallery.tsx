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
    <section className={styles.gallery} aria-label="رسانه‌های محصول">
      <div
        className={styles.galleryMain}
        aria-label={selected?.label}
      >
        {selected?.videoUrl ? (
          <video
            key={selected.videoUrl}
            className={styles.productVideo}
            src={selected.videoUrl}
            controls
            playsInline
            preload="metadata"
          >
            مرورگر شما امکان نمایش ویدئو را ندارد.
          </video>
        ) : selected?.imageUrl ? (
          <img
            src={selected.imageUrl}
            alt={selected.label}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span>{mediaLabel}</span>
        )}
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
            {item.videoUrl ? (
              <span className={styles.videoThumbnail} aria-hidden="true">▶</span>
            ) : item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span>{mediaLabel}</span>
            )}
            <small>{(index + 1).toLocaleString("fa-IR")}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
