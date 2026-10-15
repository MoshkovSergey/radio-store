import type { Metadata } from 'next';
import Link from 'next/link';

import { CategorySidebar } from '@/components/CategorySidebar';
import { Pagination } from '@/components/Pagination';
import { ProductGrid } from '@/components/ProductGrid';
import { getCategories, getProducts } from '@/lib/api';
import { buildCatalogMetadata } from '@/lib/seo';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return buildCatalogMetadata();
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? '1') || 1);
  const limit = 24;
  const offset = (page - 1) * limit;

  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts({ limit: limit + 1, offset, revalidate: 300 }),
  ]);

  const hasMore = products.length > limit;
  const visibleProducts = products.slice(0, limit);

  return (
    <section className="catalog">
      <div className="catalog-layout">
        <CategorySidebar categories={categories} selectedId={null} />

        <div className="catalog-main">
          <h1 className="section-heading">Каталог товаров</h1>

          <div className="mobile-chips">
            <Link href="/catalog" className="chip active">
              Все
            </Link>

            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/category/${category.slug}`}
                className="chip"
              >
                {category.name}
              </Link>
            ))}
          </div>

          {visibleProducts.length === 0 ? (
            <div className="card empty-state">
              <p>Товары не найдены.</p>
            </div>
          ) : (
            <ProductGrid products={visibleProducts} />
          )}

          <Pagination
            currentPage={page}
            hasMore={hasMore}
            basePath="/catalog"
          />
        </div>
      </div>
    </section>
  );
}