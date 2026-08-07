import { Container } from '@miran/ui';
import { navigationGroups } from '@/features/navigation/navigation-data';

export function MegaMenu() {
  return (
    <nav className="mega-menu" aria-label="دسته‌بندی‌های اصلی">
      <Container size="wide" className="mega-menu__inner">
        <details className="mega-menu__details">
          <summary className="mega-menu__trigger">همه دسته‌بندی‌ها</summary>
          <div className="mega-menu__panel">
            {navigationGroups.map((group) => (
              <section className="mega-menu__group" key={group.href} aria-labelledby={`mega-${group.href}`}>
                <a className="mega-menu__group-title" id={`mega-${group.href}`} href={group.href}>{group.label}</a>
                <ul>
                  {group.links.map((link) => (
                    <li key={link.href}><a href={link.href}>{link.label}</a></li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </details>

        <a href="/offers">پیشنهادهای ویژه</a>
        <a href="/trending">پرفروش‌ها</a>
        <a href="/brands">برندها</a>
      </Container>
    </nav>
  );
}
