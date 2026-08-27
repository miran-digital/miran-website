import { Container } from "@/components/ui";
import styles from "./quick-access.module.css";

const quickItems = [
  { label: "شگفت‌انگیزها", href: "/offers", mark: "٪", tone: "red" },
  { label: "سوپرمارکت", href: "/category/grocery", mark: "خ", tone: "orange" },
  { label: "کالای دیجیتال", href: "/category/digital", mark: "د", tone: "blue" },
  { label: "خانه و آشپزخانه", href: "/category/home-kitchen", mark: "خ", tone: "cyan" },
  { label: "مد و پوشاک", href: "/category/fashion", mark: "م", tone: "violet" },
  { label: "زیبایی و سلامت", href: "/category/beauty-health", mark: "ز", tone: "pink" },
  { label: "ورزش و سفر", href: "/category/sports-travel", mark: "و", tone: "green" },
  { label: "بیشتر", href: "/categories", mark: "•••", tone: "gray" },
] as const;

export function QuickAccess() {
  return (
    <nav className={styles.section} aria-label="دسترسی سریع فروشگاه">
      <Container size="wide">
        <div className={styles.rail}>
          {quickItems.map((item) => (
            <a key={item.href} href={item.href}>
              <span data-tone={item.tone} aria-hidden="true">
                {item.mark}
              </span>
              <b>{item.label}</b>
            </a>
          ))}
        </div>
      </Container>
    </nav>
  );
}
