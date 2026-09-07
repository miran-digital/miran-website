"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogProductMedia } from "./catalog-gateway";
import styles from "./product-detail.module.css";

type ProductGalleryProps = {
  items: readonly CatalogProductMedia[];
  mediaLabel: string;
};

export function ProductGallery({ items, mediaLabel }: ProductGalleryProps) {
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const lightboxCloseRef = useRef<HTMLButtonElement>(null);
  const lightboxTriggerRef = useRef<HTMLButtonElement>(null);
  const imageItems = items.filter((item) => Boolean(item.imageUrl));
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.id === selectedId),
  );
  const selected = items[selectedIndex] ?? items[0];

  function selectIndex(index: number) {
    if (!items.length) return;
    const normalized = (index + items.length) % items.length;
    const item = items[normalized];
    if (item) setSelectedId(item.id);
  }

  function showPrevious() {
    selectIndex(selectedIndex - 1);
  }

  function showNext() {
    selectIndex(selectedIndex + 1);
  }

  function selectImageOffset(offset: number) {
    if (!imageItems.length || !selected) return;
    const currentImageIndex = Math.max(0, imageItems.findIndex((item) => item.id === selected.id));
    const next = imageItems[(currentImageIndex + offset + imageItems.length) % imageItems.length];
    if (next) setSelectedId(next.id);
  }

  function showPreviousImage() {
    selectImageOffset(-1);
  }

  function showNextImage() {
    selectImageOffset(1);
  }

  useEffect(() => {
    if (!lightboxOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => lightboxCloseRef.current?.focus());
    function closeLightbox() {
      setLightboxOpen(false);
      requestAnimationFrame(() => lightboxTriggerRef.current?.focus());
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLightbox();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const images = items.filter((item) => Boolean(item.imageUrl));
        setSelectedId((currentId) => {
          if (!images.length) return currentId;
          const currentIndex = Math.max(0, images.findIndex((item) => item.id === currentId));
          const offset = event.key === "ArrowLeft" ? -1 : 1;
          return images[(currentIndex + offset + images.length) % images.length]?.id ?? currentId;
        });
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = lightboxRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [lightboxOpen, items]);

  function handleTouchStart(event: React.TouchEvent) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: React.TouchEvent) {
    const start = touchStartX.current;
    const end = event.changedTouches[0]?.clientX;
    touchStartX.current = null;
    if (start === null || end === undefined || Math.abs(end - start) < 45) return;
    if (end < start) showNext();
    else showPrevious();
  }

  return (
    <section className={styles.gallery} aria-label="رسانه‌های محصول">
      <div
        className={styles.galleryStage}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
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
          <button
            ref={lightboxTriggerRef}
            type="button"
            className={styles.galleryImageButton}
            aria-label={`بزرگ‌نمایی ${selected.label}`}
            onClick={() => setLightboxOpen(true)}
          >
            <img
              className={styles.productImage}
              src={selected.imageUrl}
              alt={selected.label}
              draggable={false}
            />
            <span className={styles.zoomHint} aria-hidden="true">بزرگ‌نمایی</span>
          </button>
        ) : (
          <div className={styles.galleryPlaceholder}>
            <strong>{mediaLabel}</strong>
            <span>{selected?.label ?? "تصویر محصول"}</span>
          </div>
        )}

        {items.length > 1 ? (
          <>
            <button
              type="button"
              className={`${styles.galleryArrow} ${styles.galleryArrowPrevious}`}
              onClick={showPrevious}
              aria-label="نمای قبلی محصول"
            >
              ‹
            </button>
            <button
              type="button"
              className={`${styles.galleryArrow} ${styles.galleryArrowNext}`}
              onClick={showNext}
              aria-label="نمای بعدی محصول"
            >
              ›
            </button>
          </>
        ) : null}

        <span className={styles.mediaCounter} aria-live="polite">
          {(selectedIndex + 1).toLocaleString("fa-IR")} / {items.length.toLocaleString("fa-IR")}
        </span>
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
              <img className={styles.thumbnailImage} src={item.imageUrl} alt="" draggable={false} />
            ) : (
              <span className={styles.thumbnailFallback}>{mediaLabel}</span>
            )}
            <small>{(index + 1).toLocaleString("fa-IR")}</small>
          </button>
        ))}
      </div>

      {lightboxOpen && selected?.imageUrl ? (
        <div
          ref={lightboxRef}
          className={styles.lightbox}
          role="dialog"
          aria-modal="true"
          aria-label={`نمای بزرگ ${selected.label}`}
        >
          <button
            ref={lightboxCloseRef}
            type="button"
            className={styles.lightboxClose}
            onClick={() => {
              setLightboxOpen(false);
              requestAnimationFrame(() => lightboxTriggerRef.current?.focus());
            }}
            aria-label="بستن بزرگ‌نمایی"
          >
            ×
          </button>
          <img className={styles.lightboxImage} src={selected.imageUrl} alt={selected.label} />
          {imageItems.length > 1 ? (
            <div className={styles.lightboxControls}>
              <button type="button" onClick={showPreviousImage} aria-label="تصویر قبلی">‹</button>
              <span>{(imageItems.findIndex((item) => item.id === selected.id) + 1).toLocaleString("fa-IR")} از {imageItems.length.toLocaleString("fa-IR")}</span>
              <button type="button" onClick={showNextImage} aria-label="تصویر بعدی">›</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
