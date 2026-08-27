import { Container } from '@/components/ui';
import { getFooterContent } from './footer-content';
import styles from './site-footer.module.css';
import { ManagedBrand } from '@/features/admin/managed-storefront';
import { currentCalendarYear } from '@/lib/jalali';
import { readStorefrontState } from '@/db/admin-repository';

export async function SiteFooter() {
  const content = await getFooterContent();
  const calendarMode = await readStorefrontState()
    .then((state) => state.commerce.calendarMode)
    .catch(() => 'jalali' as const);
  return (
    <footer className={styles.footer} aria-labelledby="footer-brand">
      <Container size="wide">
        <div className={styles.main}>
          <div className={styles.brand}>
            <a id="footer-brand" className={styles.logo} href="/">
              <ManagedBrand imageClassName="managed-brand-image" />
            </a>
            <p>{content.description}</p>
          </div>
          <nav className={styles.groups} aria-label="لینک‌های پایین صفحه">
            {content.groups.map((group) => (
              <section key={group.id}>
                <h2>{group.title}</h2>
                <ul>
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <a href={link.href}>{link.label}</a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
        </div>
        <div className={styles.bottom}>
          <p>© {currentCalendarYear(calendarMode)} Miran Shop</p>
          <nav aria-label="قوانین">
            <ul>
              {content.legalLinks.map((link) => (
                <li key={link.href}>
                  <a href={link.href}>{link.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </Container>
    </footer>
  );
}
