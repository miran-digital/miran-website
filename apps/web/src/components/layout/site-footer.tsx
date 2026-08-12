import { Container } from '@miran/ui';
import { getFooterContent } from './footer-content';
import styles from './site-footer.module.css';

export async function SiteFooter() {
  const content = await getFooterContent();
  return (
    <footer className={styles.footer} aria-labelledby="footer-brand">
      <Container size="wide">
        <div className={styles.main}>
          <div className={styles.brand}>
            <a id="footer-brand" className={styles.logo} href="/">
              Miran
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
          <p>© {new Date().getFullYear()} Miran Shop</p>
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
