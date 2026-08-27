import { navigationGroups } from '@/features/navigation/navigation-data';
import { ManagedMegaMenuCategories } from '@/features/admin/managed-storefront';

export function MegaMenu() {
  return (
    <nav className="mega-menu" aria-label="دسته‌بندی‌های اصلی">
      <div className="mega-menu__inner">
        <details className="mega-menu__details">
          <summary className="mega-menu__trigger">دسته‌بندی کالاها</summary>
          <div className="mega-menu__panel">
            <ManagedMegaMenuCategories groups={navigationGroups} />
          </div>
        </details>

        <a href="/offers">شگفت‌انگیزها</a>
        <a href="/trending">پرفروش‌ترین‌ها</a>
        <a href="/brands">برندها</a>
      </div>
    </nav>
  );
}
