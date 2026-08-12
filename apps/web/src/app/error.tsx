"use client";

import { useEffect } from "react";
import { Container, ErrorState } from "@miran/ui";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main>
      <Container>
        <ErrorState
          title="بارگذاری صفحه ممکن نشد"
          description="لطفاً دوباره تلاش کنید. اگر مشکل ادامه داشت، از مسیر راهنما با پشتیبانی تماس بگیرید."
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
