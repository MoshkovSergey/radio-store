import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/cart',
          '/login',
          '/orders',
          '/search',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}