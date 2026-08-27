"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Container } from "@/components/ui";
import { CategorySection } from "@/features/home/category-section";
import type { HomeBrandSection, HomeCategory } from "@/features/home/home-content";
import type { HeroContent } from "@/features/home/home-content";
import type { HomeProductRail } from "@/features/home/merchandising-content";
import type { NavigationGroup } from "@/features/navigation/navigation-data";
import { ProductRail } from "@/features/home/product-rail";
import { BrandSection } from "@/features/home/brand-section";
import {
  AmazingOffersRail,
  type AmazingDisplayProduct,
} from "@/features/offers/amazing-offers";
import {
  type AdminSectionKey,
} from "./admin-store";
import { isPublicAmazingProductActive } from "./public-storefront";
import { usePublicStorefrontState } from "./public-storefront-provider";
import { productHref } from "@/lib/product-link";
import styles from "./managed-storefront.module.css";

function useAdminState() {
  return usePublicStorefrontState();
}

export function ManagedSection({
  section,
  children,
}: {
  section: AdminSectionKey;
  children: ReactNode;
}) {
  const state = useAdminState();
  return state.sections[section] ? children : null;
}

export function ManagedHeaderNotice() {
  const state = useAdminState();
  const messages = state.headerMessages;
  if (!messages.length) return null;
  return (
    <div
      className="site-header__notice"
      style={{
        background: messages[0]?.backgroundColor,
        color: messages[0]?.textColor,
      }}
    >
      <div className="site-header__notice-track">
        {messages.map((message) => (
          <a
            key={message.id}
            href={message.href || "/"}
            style={{
              background: message.backgroundColor,
              color: message.textColor,
            }}
          >
            {message.text}
          </a>
        ))}
      </div>
    </div>
  );
}

export function ManagedBrand({ imageClassName }: { imageClassName?: string }) {
  const state = useAdminState();
  return state.branding.logoUrl ? (
    <img
      className={imageClassName}
      src={state.branding.logoUrl}
      alt={state.branding.logoAlt}
    />
  ) : (
    <span>{state.branding.siteName}</span>
  );
}

export function ManagedMegaMenuCategories({
  groups,
}: {
  groups: readonly NavigationGroup[];
}) {
  const state = useAdminState();
  const categories = state.categories;
  const overrides = new Map(
    categories.filter((category) => category.system).map((category) => [category.slug, category]),
  );
  const visibleCategorySlugs = new Set(state.visibleCategorySlugs);
  const visibleGroups = groups.filter(
    (group) => {
      const slug = group.href.replace("/category/", "");
      return visibleCategorySlugs.has(slug);
    },
  );
  const categoryRank = new Map(state.categoryOrder.map((slug, index) => [slug, index]));
  const customRoots = categories
    .filter((category) => !category.system && !category.parentSlug)
    .sort((left, right) => (categoryRank.get(left.slug) ?? 999) - (categoryRank.get(right.slug) ?? 999));
  return (
    <>
      {visibleGroups
        .sort((left, right) => (categoryRank.get(left.href.replace("/category/", "")) ?? 999) - (categoryRank.get(right.href.replace("/category/", "")) ?? 999))
        .map((group) => {
        const groupSlug = group.href.replace("/category/", "");
        const groupOverride = overrides.get(groupSlug);
        const links = [
          ...group.links.filter(
            (link) => visibleCategorySlugs.has(link.href.replace("/category/", "")),
          ).map((link) => {
            const slug = link.href.replace("/category/", "");
            const override = overrides.get(slug);
            return { label: override?.name ?? link.label, href: link.href };
          }),
          ...categories
            .filter((category) => !category.system && category.parentSlug === groupSlug)
            .map((category) => ({
              label: category.name,
              href: `/category/${category.slug}`,
            })),
        ];
        return (
          <section className="mega-menu__group" key={group.href} aria-labelledby={`mega-${groupSlug}`}>
            <a className="mega-menu__group-title" id={`mega-${groupSlug}`} href={group.href}>
              {groupOverride?.imageUrl && !groupOverride.imageHidden ? <img className="mega-menu__category-image" src={groupOverride.imageUrl} alt="" /> : !groupOverride?.imageHidden ? <span className="mega-menu__category-icon" data-category={groupSlug} /> : null}
              {groupOverride?.name ?? group.label}
            </a>
            <ul>
              {links.map((link) => <li key={link.href}><a href={link.href}>{link.label}</a></li>)}
            </ul>
          </section>
        );
      })}
      {customRoots.map((category) => (
        <section className="mega-menu__group" key={category.id} aria-labelledby={`mega-${category.id}`}>
          <a className="mega-menu__group-title" id={`mega-${category.id}`} href={`/category/${category.slug}`}>
            {category.imageUrl && !category.imageHidden ? <img className="mega-menu__category-image" src={category.imageUrl} alt="" /> : null}
            {category.name}
          </a>
          <ul>
            {categories.filter((item) => item.parentSlug === category.slug).map((item) => (
              <li key={item.id}><a href={`/category/${item.slug}`}>{item.name}</a></li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export function ManagedCategories({
  categories,
}: {
  categories: readonly HomeCategory[];
}) {
  const state = useAdminState();
  if (!state.sections.categories) return null;
  const systemOverrides = new Map(
    state.categories
      .filter((category) => category.system)
      .map((category) => [category.slug, category]),
  );
  const baseCategories: HomeCategory[] = categories.map((category) => {
    const slug = category.href.split("/").at(-1) ?? category.id;
    const override = systemOverrides.get(slug);
    return override
      ? {
          ...category,
          id: override.id,
          name: override.name,
          itemCountLabel: override.description,
          ...(override.imageUrl ? { imageUrl: override.imageUrl } : {}),
          imageHidden: override.imageHidden,
        }
      : category;
  });
  const managedCategories: HomeCategory[] = state.categories
    .filter((category) => !category.system && !category.parentSlug)
    .map((category) => ({
      id: category.id,
      name: category.name,
      href: `/category/${category.slug}`,
      itemCountLabel: category.description,
      ...(category.imageUrl ? { imageUrl: category.imageUrl } : {}),
      imageHidden: category.imageHidden,
    }));
  const categoryRank = new Map(state.categoryOrder.map((slug, index) => [slug, index]));
  const visibleCategories = [...baseCategories, ...managedCategories].filter(
    (category) => {
      const slug = category.href.split("/").filter(Boolean).at(-1) ?? category.id;
      return state.visibleCategorySlugs.includes(slug);
    },
  ).sort((left, right) => {
    const leftSlug = left.href.split("/").at(-1) ?? left.id;
    const rightSlug = right.href.split("/").at(-1) ?? right.id;
    return (categoryRank.get(leftSlug) ?? 999) - (categoryRank.get(rightSlug) ?? 999);
  });
  return visibleCategories.length > 0 ? (
    <CategorySection categories={visibleCategories} />
  ) : null;
}

export function ManagedBrands({
  fallback,
  allowFallback,
}: {
  fallback: HomeBrandSection;
  allowFallback: boolean;
}) {
  const state = useAdminState();
  const items = state.brands.map((brand) => ({
    id: brand.id,
    name: brand.name,
    href: `/brand/${brand.slug}`,
  }));
  if (items.length === 0 && !allowFallback) return null;
  return (
    <BrandSection
      content={{ ...fallback, items: items.length > 0 ? items : fallback.items }}
    />
  );
}

export function ManagedBanners({
  fallbackHero,
  categorySlug,
}: {
  fallbackHero?: HeroContent;
  categorySlug?: string;
}) {
  const state = useAdminState();
  const banners = state.banners.filter((banner) =>
    categorySlug
      ? banner.scope === "category" && banner.categorySlug === categorySlug
      : banner.scope === "home",
  );
  const wideBanners = banners.filter((banner) => banner.placement === "wide");
  const compactBanners = banners.filter((banner) => banner.placement === "half");
  const [activeSlide, setActiveSlide] = useState(0);
  const visibleSlide = activeSlide % Math.max(1, wideBanners.length);
  useEffect(() => {
    if (wideBanners.length < 2) return;
    const timer = window.setInterval(
      () => setActiveSlide((current) => (current + 1) % wideBanners.length),
      5500,
    );
    return () => window.clearInterval(timer);
  }, [wideBanners.length]);

  if (!fallbackHero && banners.length === 0) return null;

  return (
    <section className={styles.banners} aria-label={categorySlug ? "بنرهای این دسته" : "بنرهای فروشگاه"}>
      {!categorySlug ? <h1 className="sr-only">Miran Shop؛ فروشگاه آنلاین چنددسته‌ای</h1> : null}
      <Container size="wide" className={styles.bannerGrid}>
        {wideBanners.length > 0 || fallbackHero ? <div className={styles.heroCarousel} aria-roledescription="carousel">
          {wideBanners.length > 0 ? wideBanners.map((banner, index) => (
            <a
              key={banner.id}
              className={styles.heroSlide}
              data-active={index === visibleSlide}
              href={banner.href || "/"}
              aria-hidden={index !== visibleSlide}
              tabIndex={index === visibleSlide ? 0 : -1}
              aria-label={banner.title}
            >
              <picture>
                {banner.mobileImageUrl ? <source media="(max-width: 40rem)" srcSet={banner.mobileImageUrl} /> : null}
                <img src={banner.desktopImageUrl} alt={banner.altText || banner.title} fetchPriority={index === 0 ? "high" : "auto"} />
              </picture>
            </a>
          )) : fallbackHero ? (
            <a className={styles.heroSlide} data-active="true" href={fallbackHero.primaryAction.href}>
              <img src="/miran-default-hero.png" alt="محصولات منتخب Miran Shop" fetchPriority="high" />
              <span className={styles.defaultHeroCopy}>
                <small>{fallbackHero.eyebrow}</small>
                <strong>{fallbackHero.title}</strong>
                <em>{fallbackHero.description}</em>
                <b>{fallbackHero.primaryAction.label}</b>
              </span>
            </a>
          ) : null}
          {wideBanners.length > 1 ? (
            <>
              <button className={styles.previousSlide} type="button" onClick={() => setActiveSlide((visibleSlide - 1 + wideBanners.length) % wideBanners.length)} aria-label="بنر قبلی">‹</button>
              <button className={styles.nextSlide} type="button" onClick={() => setActiveSlide((visibleSlide + 1) % wideBanners.length)} aria-label="بنر بعدی">›</button>
              <div className={styles.slideDots} aria-label="انتخاب بنر">
                {wideBanners.map((banner, index) => <button key={banner.id} type="button" data-active={index === visibleSlide} onClick={() => setActiveSlide(index)} aria-label={`بنر ${index + 1}`} />)}
              </div>
            </>
          ) : null}
        </div> : null}
        {compactBanners.length > 0 ? (
          <div className={styles.compactBannerGrid}>
            {compactBanners.map((banner) => (
              <a key={banner.id} href={banner.href || "/"} aria-label={banner.title}>
                <picture>
                  {banner.mobileImageUrl ? <source media="(max-width: 40rem)" srcSet={banner.mobileImageUrl} /> : null}
                  <img src={banner.desktopImageUrl} alt={banner.altText || banner.title} loading="lazy" />
                </picture>
              </a>
            ))}
          </div>
        ) : null}
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
  if (!state.sections[sectionKey] || row?.enabled === false) return null;
  const itemLimit = row?.itemLimit ?? section.products.length;
  const managedProducts = state.products
    .filter((product) => product.placement === section.id)
    .map((product) => {
      const amazingActive = isPublicAmazingProductActive(product);
      return ({
      id: product.id,
      title: product.title,
      href: productHref(product.slug),
      mediaLabel: product.brand || "Miran",
      eyebrow: product.category,
      badge: amazingActive ? "شگفت‌انگیز" : "جدید",
      ...(amazingActive ? { offerEndsAt: product.amazingEndsAt } : {}),
      price: { amountMinor: product.priceMinor, currency: product.currency },
      ...(product.imageUrls[0] ? { imageUrl: product.imageUrls[0] } : {}),
      });
    });
  return (
    <ProductRail
      section={{
        ...section,
        products: [...managedProducts, ...section.products].slice(0, itemLimit),
      }}
      tone={tone}
    />
  );
}

export function ManagedAmazingOffers({
  fallback,
}: {
  fallback: HomeProductRail;
}) {
  const state = useAdminState();
  if (!state.sections.specialOffers) return null;
  const config = state.amazingSection;
  const managedProducts: AmazingDisplayProduct[] = state.products
    .filter((product) => {
      if (config.selectionMode === "placement") {
        return product.placement === "special-offers";
      }
      if (config.selectionMode === "discounted") {
        return product.compareAtPriceMinor > product.priceMinor;
      }
      return isPublicAmazingProductActive(product);
    })
    .map((product) => {
      const amazingActive = isPublicAmazingProductActive(product);
      return {
        id: product.id,
        title: product.title,
        href: productHref(product.slug),
        mediaLabel: product.brand || "Miran",
        eyebrow: product.category,
        price: { amountMinor: product.priceMinor, currency: product.currency },
        ...(product.compareAtPriceMinor > product.priceMinor
          ? {
              previousPrice: {
                amountMinor: product.compareAtPriceMinor,
                currency: product.currency,
              },
            }
          : {}),
        ...(product.imageUrls[0] ? { imageUrl: product.imageUrls[0] } : {}),
        ...(amazingActive ? { offerEndsAt: product.amazingEndsAt } : {}),
        inStock: product.availableQuantity > 0,
      };
    });
  const fallbackProducts: AmazingDisplayProduct[] = fallback.products.map(
    (product) => ({ ...product, inStock: true }),
  );
  const products = [...managedProducts, ...fallbackProducts]
    .filter(
      (product, index, items) =>
        items.findIndex((candidate) => candidate.id === product.id) === index,
    )
    .slice(0, config.itemLimit);
  const productEnds = products
    .map((product) => product.offerEndsAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  const endsAt = config.endsAt || productEnds[0];
  return (
    <AmazingOffersRail
      title={config.title}
      subtitle={config.subtitle}
      href={config.href}
      linkLabel={config.linkLabel}
      backgroundColor={config.backgroundColor}
      textColor={config.textColor}
      products={products}
      {...(endsAt ? { endsAt } : {})}
      showTimer={config.showTimer}
    />
  );
}
