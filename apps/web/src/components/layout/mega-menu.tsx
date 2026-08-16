import { Container } from "@miran/ui";
import { apiRequest } from "@/lib/api/client";

type ApiCategory = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  sortOrder: number;
};

export async function MegaMenu() {
  let categories: ApiCategory[] = [];
  try {
    categories = await apiRequest<ApiCategory[]>("/v1/catalog/categories");
  } catch {
    // Primary header remains usable during a temporary catalog outage.
  }

  const parents = categories.filter((category) => category.parentId === null);

  return (
    <nav className="mega-menu" aria-label="دسته‌بندی‌های اصلی">
      <Container size="wide" className="mega-menu__inner">
        <details className="mega-menu__details">
          <summary className="mega-menu__trigger">همه دسته‌بندی‌ها</summary>
          <div className="mega-menu__panel">
            {parents.length === 0 ? (
              <section className="mega-menu__group">
                <a className="mega-menu__group-title" href="/categories">مشاهده دسته‌بندی‌ها</a>
              </section>
            ) : null}
            {parents.map((group) => {
              const children = categories.filter((category) => category.parentId === group.id);
              return (
                <section className="mega-menu__group" key={group.id} aria-labelledby={`mega-${group.id}`}>
                  <a
                    className="mega-menu__group-title"
                    id={`mega-${group.id}`}
                    href={`/category/${encodeURIComponent(group.slug)}`}
                  >
                    {group.name}
                  </a>
                  {children.length > 0 ? (
                    <ul>
                      {children.map((child) => (
                        <li key={child.id}>
                          <a href={`/category/${encodeURIComponent(child.slug)}`}>{child.name}</a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              );
            })}
          </div>
        </details>

        <a href="/offers">پیشنهاد شگفت‌انگیز</a>
        <a href="/categories">دسته‌بندی‌ها</a>
        <a href="/seller">فروشنده شوید</a>
      </Container>
    </nav>
  );
}
