import type { Metadata } from 'next';

import { ProductGrid } from '@/components/ProductGrid';
import { getProducts } from '@/lib/api';
import { noIndexFollowMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...noIndexFollowMetadata(),
    title: 'Поиск по каталогу',
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? '').trim();

  const products = query
    ? await getProducts({ search: query, limit: 48, revalidate: 0 })
    : [];

  return (
    <section>
      <h1 className="section-heading">Поиск</h1>

      <form action="/search" method="get" className="hero-search" style={{ marginBottom: 18 }}>
        <input
          className="input"
          name="q"
          defaultValue={query}
          placeholder="Поиск по названию, SKU или производителю"
        />
        <button className="button primary" type="submit">
          Найти
        </button>
      </form>

      {!query ? (
        <div className="card empty-state">
          <p>Введите запрос для поиска.</p>
        </div>
      ) : products.length === 0 ? (
        <div className="card empty-state">
          <p>По запросу «{query}» ничего не найдено.</p>
        </div>
      ) : (
        <>
          <p className="muted" style={{ marginBottom: 14 }}>
            Найдено товаров: {products.length}
          </p>
          <ProductGrid products={products} />
        </>
      )}
    </section>
  );
}