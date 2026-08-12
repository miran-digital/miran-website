import { Container, EmptyState } from "@miran/ui";

export default function NotFound() {
  return (
    <main>
      <Container>
        <EmptyState
          title="این صفحه پیدا نشد"
          description="نشانی را بررسی کنید یا از صفحه اصلی مسیر دیگری را انتخاب کنید."
          action={<a href="/">بازگشت به صفحه اصلی</a>}
        />
      </Container>
    </main>
  );
}
