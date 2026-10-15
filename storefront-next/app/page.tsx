import Link from 'next/link';

import { JsonLd } from '@/components/JsonLd';
import { ProductGrid } from '@/components/ProductGrid';
import { getCategories, getProducts } from '@/lib/api';
import { buildHomeMetadata, absoluteUrl } from '@/lib/seo';
import type { Metadata } from 'next';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return buildHomeMetadata();
}

export default async function HomePage() {
  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts({ limit: 8, revalidate: 300 }),
  ]);

  const websiteLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Radio Store',
    url: absoluteUrl('/'),
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${absoluteUrl('/search')}?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  const organizationLd = {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    name: 'Radio Store',
    url: absoluteUrl('/'),
    description:
      'Интернет-магазин радиодеталей, модулей, микроконтроллеров и инструментов.',
  };

  return (
    <>
      <JsonLd data={[websiteLd, organizationLd]} />

      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">Магазин радиодеталей</div>
          <h1>Компоненты, модули и инструменты для ваших проектов</h1>
          <p>
            Резисторы, конденсаторы, микроконтроллеры, ESP32, датчики,
            инструменты и многое другое.
          </p>

          <form action="/search" method="get" className="hero-search">
            <input
              className="input"
              name="q"
              placeholder="Поиск по названию, SKU или производителю"
            />
            <button className="button primary" type="submit">
              Найти
            </button>
          </form>
        </div>
      </section>

      <section>
        <h2 className="section-heading">Категории</h2>

        {categories.length === 0 ? (
          <p className="muted">Категории пока не загружены.</p>
        ) : (
          <div className="category-cards">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/category/${category.slug}`}
                className="card category-card"
              >
                <span>{category.name}</span>
                <span aria-hidden>→</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="toolbar">
          <h2 className="section-heading" style={{ margin: 0 }}>
            Новинки
          </h2>
          <Link href="/catalog" className="button">
            Весь каталог
          </Link>
        </div>

        <ProductGrid products={products} />
      </section>
    </>
  );
}