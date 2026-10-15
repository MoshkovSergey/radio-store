import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';

import { Breadcrumbs } from '@/components/Breadcrumbs';
import { CategorySidebar } from '@/components/CategorySidebar';
import { JsonLd } from '@/components/JsonLd';
import { Pagination } from '@/components/Pagination';
import { ProductGrid } from '@/components/ProductGrid';
import {
  getCategories,
  getCategoryBySlug,
  getProducts,
} from '@/lib/api';
import { absoluteUrl, buildCategoryMetadata } from '@/lib/seo';

export const revalidate = 300;

export async function generateStaticParams() {
  const categories = await getCategories();

  return categories.map((category) => ({
    slug: category.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    return {
      title: 'Категория не найдена',
    };
  }

  return buildCategoryMetadata(category);
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ slug }, pageParams] = await Promise.all([params, searchParams]);

  const category = await getCategoryBySlug(slug);

  if (!category) {
    notFound();
  }

  const page = Math.max(1, Number(pageParams.page ?? '1') || 1);
  const limit = 24;
  const offset = (page - 1) * limit;

  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts({
      category_id: category.id,
      limit: limit + 1,
      offset,
      revalidate: 300,
    }),
  ]);

  const hasMore = products.length > limit;
  const visibleProducts = products.slice(0, limit);

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Главная',
        item: absoluteUrl('/'),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Каталог',
        item: absoluteUrl('/catalog'),
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: category.name,
        item: absoluteUrl(`/category/${category.slug}`),
      },
    ],
  };

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: category.name,
    itemListElement: visibleProducts.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: absoluteUrl(`/product/${product.id}`),
      name: product.name,
    })),
  };

  return (
    <>
      <JsonLd data={[breadcrumbLd, itemListLd]} />

      <Breadcrumbs
        items={[
          { label: 'Главная', href: '/' },
          { label: 'Каталог', href: '/catalog' },
          { label: category.name, href: `/category/${category.slug}` },
        ]}
      />

      <section className="catalog">
        <div className="catalog-layout">
          <CategorySidebar
            categories={categories}
            selectedId={category.id}
          />

          <div className="catalog-main">
            <h1 className="section-heading">{category.name}</h1>

            <div className="mobile-chips">
              <Link href="/catalog" className="chip">
                Все
              </Link>

              {categories.map((item) => (
                <Link
                  key={item.id}
                  href={`/category/${item.slug}`}
                  className={
                    item.id === category.id ? 'chip active' : 'chip'
                  }
                >
                  {item.name}
                </Link>
              ))}
            </div>

            {visibleProducts.length === 0 ? (
              <div className="card empty-state">
                <p>В этой категории пока нет товаров.</p>
              </div>
            ) : (
              <ProductGrid products={visibleProducts} />
            )}

            <Pagination
              currentPage={page}
              hasMore={hasMore}
              basePath={`/category/${category.slug}`}
            />
          </div>
        </div>
      </section>
    </>
  );
}