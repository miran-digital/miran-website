import { Container } from "@/components/ui";
import { CartLink } from "@/features/cart/cart-link";
import { HeaderSearch } from "@/features/search/header-search";
import { WishlistLink } from "@/features/wishlist/wishlist-link";
import { MegaMenu } from "./mega-menu";
import { getCustomerUser } from "@/lib/customer-auth";
import { HeaderAddress } from "@/features/account/header-address";
import {
  ManagedBrand,
  ManagedHeaderNotice,
} from "@/features/admin/managed-storefront";

export async function SiteHeader() {
  const user = await getCustomerUser();
  const accountHref = "/account";
  return (
    <header className="site-header">
      <ManagedHeaderNotice />
      <Container size="wide" className="site-header__inner">
        <a
          className="site-header__brand"
          href="/"
          aria-label="صفحه اصلی MIRAN"
        >
          <ManagedBrand imageClassName="managed-brand-image" />
        </a>
        <div className="site-header__search">
          <HeaderSearch />
        </div>
        <nav className="site-header__actions" aria-label="دسترسی سریع">
          <span className="site-header__cart">
            <CartLink compact />
          </span>
          <a
            className="site-header__account"
            href={accountHref}
            title={user?.fullName ?? user?.email}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" />
            </svg>
            <span>{user ? user.fullName ?? user.email : "ورود | ثبت‌نام"}</span>
          </a>
          <span className="site-header__wishlist">
            <WishlistLink compact />
          </span>
        </nav>
      </Container>
      <Container size="wide" className="site-header__bottom">
        <MegaMenu />
        <div className="site-header__address">
          <HeaderAddress
            signedIn={Boolean(user)}
            signInHref="/account?next=/account%23addresses"
          />
        </div>
      </Container>
    </header>
  );
}
