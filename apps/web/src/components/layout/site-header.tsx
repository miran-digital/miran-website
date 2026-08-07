import { Container } from '@miran/ui';
import { HeaderSearch } from '@/features/search/header-search';
import { MegaMenu } from './mega-menu';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__notice">ارسال سریع، خرید امن و پشتیبانی Miran Shop</div>
      <Container size="wide" className="site-header__inner">
        <a className="site-header__brand" href="/" aria-label="صفحه اصلی Miran Shop">Miran</a>
        <div className="site-header__search"><HeaderSearch /></div>
        <nav className="site-header__actions" aria-label="دسترسی سریع">
          <a href="/account">حساب کاربری</a>
          <a href="/wishlist">علاقه‌مندی‌ها</a>
          <a href="/cart">سبد خرید</a>
        </nav>
      </Container>
      <MegaMenu />
    </header>
  );
}
