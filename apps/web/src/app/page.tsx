import { Container } from '@miran/ui';

export default function HomePage() {
  return (
    <main className="foundation-page">
      <Container>
        <section className="foundation-card" aria-labelledby="foundation-title">
          <p className="foundation-kicker">Miran Shop</p>
          <h1 id="foundation-title">پایه Storefront آماده توسعه است</h1>
          <p>
            این صفحه فقط برای تأیید سالم بودن لایه وب، RTL، Design Tokens و ساختار مشترک است.
            طراحی نهایی صفحه اصلی در مرحله بعد انجام می‌شود.
          </p>
        </section>
      </Container>
    </main>
  );
}
