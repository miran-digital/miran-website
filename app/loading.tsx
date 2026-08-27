import { Container, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <main aria-busy="true" aria-label="در حال بارگذاری">
      <Container size="wide">
        <Skeleton height="18rem" />
      </Container>
    </main>
  );
}
