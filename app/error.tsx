"use client";

import { Container, ErrorState } from "@/components/ui";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <main>
      <Container>
        <ErrorState
          title="بارگذاری صفحه ممکن نشد"
          description="اطلاعات فروشگاه موقتاً در دسترس نیست؛ کمی بعد دوباره تلاش کنید."
          action={
            <button type="button" onClick={reset}>
              تلاش دوباره
            </button>
          }
        />
      </Container>
    </main>
  );
}
