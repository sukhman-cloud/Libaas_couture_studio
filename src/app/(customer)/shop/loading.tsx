import { ProductGridSkeleton } from "@/components/catalog/product-grid";
import { Container, Section } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";

export default function ShopLoading() {
  return (
    <Container>
      <Section space="md">
        <div className="mb-6 sm:mb-8">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <ProductGridSkeleton />
      </Section>
    </Container>
  );
}
