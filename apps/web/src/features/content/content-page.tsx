import { Container } from "@miran/ui";
import type { SiteContentPage } from "./site-content";
import styles from "./content.module.css";

export function ContentPage({ page }: { page: SiteContentPage }) {
  return (
    <main className={styles.page}>
      <Container size="wide">
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
          <a href="/">خانه</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{page.title}</span>
        </nav>
        <header className={styles.header}>
          <p>{page.eyebrow}</p>
          <h1>{page.title}</h1>
          <p>{page.description}</p>
          {page.status ? <div role="note">{page.status}</div> : null}
        </header>
        <div className={styles.sections}>
          {page.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets ? (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </Container>
    </main>
  );
}
