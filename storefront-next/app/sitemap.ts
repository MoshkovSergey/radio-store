import type { MetadataRoute } from 'next';

import { getCategories, getAllProductsForSitemap } from '@/lib/api';
import { absoluteUrl } from '@/lib/seo';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, products] = await Promise.all([
    getCategories(),
    getAllProductsForSitemap(),
  ]);

  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl('/'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: absoluteUrl('/catalog'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ];

  const categoryEntries: MetadataRoute.Sitemap = categories.map(
    (category) => ({
      url: absoluteUrl(`/category/${category.slug}`),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    }),
  );

  const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
    url: absoluteUrl(`/product/${product.id}`),
    lastModified: new Date(product.updated_at || Date.now()),
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  return [
    ...staticEntries,
    ...categoryEntries,
    ...productEntries,
  ];
}