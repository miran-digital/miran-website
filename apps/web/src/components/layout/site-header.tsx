import { Container, SearchInput } from '@miran/ui';

export function SiteHeader() {
  return (
    <header className="site-header">
      <Container size="wide" className="site-header__inner">
        <a className="site-header__brand" href="/">Miran</a>
        <div className="site-header__search"><SearchInput /></div>
        <nav className="site-header__actions" aria-label="دسترسی سریع">
          <a href="/account">حساب کاربری</a>
          <a href="/wishlist">علاقه‌مندی‌ها</a>
          <a href="/cart">سبد خرید</a>
        </nav>
      </Container>
    </header>
  );
}
