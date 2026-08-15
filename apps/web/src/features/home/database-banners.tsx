import { Container } from "@miran/ui";
import type { StorefrontBanner } from "@/lib/storefront/cms";
import styles from "@/features/admin/managed-storefront.module.css";

export function DatabaseBanners({ banners }: { banners: readonly StorefrontBanner[] }) {
  if (banners.length === 0) return null;
  return (
    <section className={styles.banners} aria-label="بنرهای فروشگاه">
      <Container size="wide" className={styles.bannerGrid}>
        {banners.map((banner) => (
          <a key={banner.id} href={banner.href || "/"} data-placement={banner.placement}>
            {banner.imageUrl ? (
              <img src={banner.imageUrl} alt={banner.title} loading="lazy" decoding="async" />
            ) : (
              <span>Miran Shop</span>
            )}
            <strong>{banner.title}</strong>
          </a>
        ))}
      </Container>
    </section>
  );
}
