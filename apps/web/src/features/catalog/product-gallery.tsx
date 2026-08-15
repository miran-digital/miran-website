"use client";

import { useState } from "react";
import type { CatalogProductMedia } from "./catalog-gateway";
import styles from "./product-detail.module.css";

type ProductGalleryProps = {
  items: readonly CatalogProductMedia[];
  mediaLabel: string;
};

function Media({ item, mediaLabel }: { item: CatalogProductMedia | undefined; mediaLabel: string }) {
  if (!item?.url) {
    return (
      <>
        <span>{mediaLabel}</span>
        <small>{item?.label ?? "بدون رسانه"}</small>
      </>
    );
  }

  if (item.mediaType === "VIDEO") {
    return (
      <video
        className={styles.galleryMedia}
        controls
        preload="metadata"
        playsInline
        aria-label={item.label}
      >
        <source src={item.url} />
        مرورگر شما پخش ویدئو را پشتیبانی نمی‌کند.
      </video>
    );
  }

  return (
    <img
      className={styles.galleryMedia}
      src={item.url}
      alt={item.label}
      loading="eager"
      decoding="async"
    />
  );
}

export function ProductGallery({ items, mediaLabel }: ProductGalleryProps) {
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  const selected = items.find((item) => item.id === selectedId) ?? items[0];

  return (
    <section className={styles.gallery} aria-label="رسانه‌های محصول">
      <div className={styles.galleryMain} aria-label={selected?.label ?? mediaLabel}>
        <Media item={selected} mediaLabel={mediaLabel} />
      </div>
      {items.length > 1 ? (
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
              {item.url && item.mediaType !== "VIDEO" ? (
                <img
                  className={styles.thumbnailMedia}
                  src={item.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span>{item.mediaType === "VIDEO" ? "Video" : mediaLabel}</span>
              )}
              <small>{(index + 1).toLocaleString("fa-IR")}</small>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
