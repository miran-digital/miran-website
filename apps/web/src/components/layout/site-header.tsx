import { Container } from "@miran/ui";
import { CartLink } from "@/features/cart/cart-link";
import { HeaderSearch } from "@/features/search/header-search";
import { WishlistLink } from "@/features/wishlist/wishlist-link";
import { getStorefrontCms } from "@/lib/storefront/cms";
import { MegaMenu } from "./mega-menu";

export async function SiteHeader() {
  let messages: Awaited<ReturnType<typeof getStorefrontCms>>["headerMessages"] = [];
  try {
    messages = (await getStorefrontCms()).headerMessages;
  } catch {
    // Navigation remains usable during a temporary CMS/API outage.
  }

  return (
    <header className="site-header">
      {messages.length > 0 ? (
        <div
          className="site-header__notice"
          style={{
            display: "flex",
            gap: "0.25rem",
            overflowX: "auto",
            background: "transparent",
            padding: 0,
          }}
          aria-label="پیام‌های فروشگاه"
        >
          {messages.map((message) => (
            <a
              key={message.id}
              href={message.href || "/"}
              style={{
                flex: "1 0 auto",
                padding: "0.55rem 1rem",
                backgroundColor: message.backgroundColor,
                color: message.textColor,
                textAlign: "center",
              }}
            >
              {message.text}
            </a>
          ))}
        </div>
      ) : null}
      <Container size="wide" className="site-header__inner">
        <a
          className="site-header__brand"
          href="/"
          aria-label="صفحه اصلی Miran Shop"
        >
          Miran
        </a>
        <div className="site-header__search">
          <HeaderSearch />
        </div>
        <nav className="site-header__actions" aria-label="دسترسی سریع">
          <a href="/account">حساب کاربری</a>
          <WishlistLink />
          <CartLink />
        </nav>
      </Container>
      <MegaMenu />
    </header>
  );
}
