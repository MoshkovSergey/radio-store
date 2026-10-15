import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Breadcrumbs } from '@/components/Breadcrumbs';
import { BuyPanel } from '@/components/BuyPanel';
import { JsonLd } from '@/components/JsonLd';
import { ProductGallery } from '@/components/ProductGallery';
import { getAllProductsForSitemap, getProductWithCategory } from '@/lib/api';
import { getAttributeEntries } from '@/lib/attributes';
import { formatPrice, schemaAvailability } from '@/lib/format';
import { absoluteUrl, buildProductMetadata } from '@/lib/seo';

export const revalidate = 60;

export async function generateStaticParams() {
  const products = await getAllProductsForSitemap();

  return products.map((product) => ({
    id: String(product.id),
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const productId = Number(id);

  if (!Number.isFinite(productId) || productId <= 0) {
    return { title: 'Товар не найден' };
  }

  const product = await getProductWithCategory(productId);

  if (!product) {
    return { title: 'Товар не найден' };
  }

  return buildProductMetadata(product);
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const productId = Number(id);

  if (!Number.isFinite(productId) || productId <= 0) {
    notFound();
  }

  const product = await getProductWithCategory(productId);

  if (!product) {
    notFound();
  }

  const attributeEntries = getAttributeEntries(product.attributes);
  const url = absoluteUrl(`/product/${product.id}`);

  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.sku,
    mpn: product.sku,
    description:
      product.description ??
      `${product.name}, артикул ${product.sku}.`,
    brand: product.manufacturer
      ? {
          '@type': 'Brand',
          name: product.manufacturer,
        }
      : undefined,
    image: (product.images ?? [])
      .map((image) => absoluteUrl(image.url))
      .concat(
        product.primary_image_url
          ? [absoluteUrl(product.primary_image_url)]
          : [],
      )
      .filter((value, index, array) => array.indexOf(value) === index),
    offers: {
      '@type': 'Offer',
      url,
      price: (product.price_minor / 100).toFixed(2),
      priceCurrency: product.currency,
      availability: schemaAvailability(product.stock_quantity),
      itemCondition: 'https://schema.org/NewCondition',
      seller: {
        '@type': 'Organization',
        name: 'Radio Store',
        url: absoluteUrl('/'),
      },
    },
  };

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
      ...(product.category
        ? [
            {
              '@type': 'ListItem' as const,
              position: 3,
              name: product.category.name,
              item: absoluteUrl(`/category/${product.category.slug}`),
            },
          ]
        : []),
      {
        '@type': 'ListItem',
        position: product.category ? 4 : 3,
        name: product.name,
        item: url,
      },
    ],
  };

  return (
    <>
      <JsonLd data={[productLd, breadcrumbLd]} />

      <Breadcrumbs
        items={[
          { label: 'Главная', href: '/' },
          { label: 'Каталог', href: '/catalog' },
          ...(product.category
            ? [
                {
                  label: product.category.name,
                  href: `/category/${product.category.slug}`,
                },
              ]
            : []),
          { label: product.name, href: `/product/${product.id}` },
        ]}
      />

      <section className="product-page">
        <div className="product-detail-grid">
          <ProductGallery
            images={product.images ?? []}
            primaryImageUrl={product.primary_image_url}
            name={product.name}
          />

          <BuyPanel
            productId={product.id}
            name={product.name}
            sku={product.sku}
            manufacturer={product.manufacturer ?? null}
            description={product.description ?? null}
            priceMinor={product.price_minor}
            currency={product.currency}
            stockQuantity={product.stock_quantity}
            isActive={product.is_active}
          />
        </div>

        <div className="card specs-card">
          <h2>Характеристики</h2>

          <table className="table specs-table">
            <tbody>
              <tr>
                <td>Артикул / SKU</td>
                <td>{product.sku}</td>
              </tr>

              {product.manufacturer ? (
                <tr>
                  <td>Производитель</td>
                  <td>{product.manufacturer}</td>
                </tr>
              ) : null}

              {product.category ? (
                <tr>
                  <td>Категория</td>
                  <td>{product.category.name}</td>
                </tr>
              ) : null}

              <tr>
                <td>Цена</td>
                <td>{formatPrice(product.price_minor, product.currency)}</td>
              </tr>

              <tr>
                <td>Остаток</td>
                <td>{product.stock_quantity}</td>
              </tr>

              {attributeEntries.map(([label, value]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}