"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Container } from "@miran/ui";
import { CategorySection } from "@/features/home/category-section";
import type { HomeCategory } from "@/features/home/home-content";
import type { HomeProductRail } from "@/features/home/merchandising-content";
import { ProductRail } from "@/features/home/product-rail";
import {
  createDefaultAdminState,
  getActiveHeaderMessage,
  getAdminState,
  subscribeToAdminState,
  type AdminSectionKey,
  type AdminState,
} from "./admin-store";
import styles from "./managed-storefront.module.css";

function useAdminState() {
  const [state, setState] = useState<AdminState>(createDefaultAdminState);
  useEffect(() => {
    const sync = () => setState(getAdminState());
    sync();
    return subscribeToAdminState(sync);
  }, []);
  return state;
}

export function ManagedSection({
  section,
  children,
}: {
  section: AdminSectionKey;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const sync = () => setVisible(getAdminState().sections[section] !== false);
    sync();
    return subscribeToAdminState(sync);
  }, [section]);
  return visible ? children : null;
}

export function ManagedHeaderNotice() {
  const state = useAdminState();
  const message = getActiveHeaderMessage(state);
  if (!message) return null;
  return (
    <div className="site-header__notice">
      <a href={message.href || "/"}>{message.text}</a>
    </div>
  );
}

export function ManagedCategories({
  categories,
}: {
  categories: readonly HomeCategory[];
}) {
  const state = useAdminState();
  if (!state.sections.categories) return null;
  const visibleCategories = categories.filter(
    (category) =>
      !state.hiddenCategoryIds.includes(
        category.href.split("/").filter(Boolean).at(-1) ?? category.id,
      ),
  );
  return visibleCategories.length > 0 ? (
    <CategorySection categories={visibleCategories} />
  ) : null;
}

export function ManagedBanners() {
  const state = useAdminState();
  const banners = state.banners.filter((banner) => banner.visible);
  if (banners.length === 0) return null;
  return (
    <section className={styles.banners} aria-label="بنرهای فروشگاه">
      <Container size="wide" className={styles.bannerGrid}>
        {banners.map((banner) => (
          <a key={banner.id} href={banner.href || "/"}>
            <span>Miran Shop</span>
            <strong>{banner.title}</strong>
          </a>
        ))}
      </Container>
    </section>
  );
}

export function ManagedProductRail({
  section,
  sectionKey,
  tone = "default",
}: {
  section: HomeProductRail;
  sectionKey: AdminSectionKey;
  tone?: "default" | "accent";
}) {
  const state = useAdminState();
  const row = state.productRows.find((item) => item.id === section.id);
  if (!state.sections[sectionKey] || row?.visible === false) return null;
  const itemLimit = row?.itemLimit ?? section.products.length;
  return (
    <ProductRail
      section={{ ...section, products: section.products.slice(0, itemLimit) }}
      tone={tone}
    />
  );
}
