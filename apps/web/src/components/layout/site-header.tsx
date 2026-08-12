import { Container } from "@miran/ui";
import { CartLink } from "@/features/cart/cart-link";
import { HeaderSearch } from "@/features/search/header-search";
import { WishlistLink } from "@/features/wishlist/wishlist-link";
import { MegaMenu } from "./mega-menu";
import { ManagedHeaderNotice } from "@/features/admin/managed-storefront";

export function SiteHeader() {
  return (
    <header className="site-header">
      <ManagedHeaderNotice />
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
