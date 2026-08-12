import { CartLink } from "@/features/cart/cart-link";

export function MobileNavigation() {
  return (
    <nav className="mobile-nav" aria-label="ناوبری موبایل">
      <a href="/">خانه</a>
      <a href="/categories">دسته‌بندی</a>
      <a href="/search">جست‌وجو</a>
      <CartLink />
    </nav>
  );
}
