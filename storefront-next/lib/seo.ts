import type { Metadata } from 'next';
import type { Category, Product } from './types';

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
}

export function absoluteUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  return `${siteUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

export function buildProductMetadata(product: Product): Metadata {
  const title = `${product.name} (${product.sku}) — купить в Radio Store`;
  const description =
    product.description ??
    `${product.name}, артикул ${product.sku}. Цена, характеристики, наличие и доставка в интернет-магазине радиодеталей Radio Store.`;

  const url = absoluteUrl(`/product/${product.id}`);

  const images = (product.images ?? [])
    .map((image) => image.url)
    .filter(Boolean)
    .map((imagePath) => absoluteUrl(imagePath));

  if (product.primary_image_url) {
    const primary = absoluteUrl(product.primary_image_url);

    if (!images.includes(primary)) {
      images.unshift(primary);
    }
  }

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: 'website',
      url,
      title,
      description,
      siteName: 'Radio Store',
      images: images.length > 0 ? images : undefined,
    },
  };
}

export function buildCategoryMetadata(category: Category): Metadata {
  const title = `${category.name} — купить с доставкой | Radio Store`;
  const description = `Каталог категории «${category.name}»: цены, характеристики, наличие и доставка. Интернет-магазин радиодеталей Radio Store.`;
  const url = absoluteUrl(`/category/${category.slug}`);

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: 'website',
      url,
      title,
      description,
      siteName: 'Radio Store',
    },
  };
}

export function buildCatalogMetadata(): Metadata {
  const title = 'Каталог радиодеталей — Radio Store';
  const description =
    'Полный каталог радиодеталей, модулей, микроконтроллеров и инструментов. Поиск по названию, SKU и производителю.';
  const url = absoluteUrl('/catalog');

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: 'website',
      url,
      title,
      description,
      siteName: 'Radio Store',
    },
  };
}

export function buildHomeMetadata(): Metadata {
  const title = 'Radio Store — интернет-магазин радиодеталей';
  const description =
    'Резисторы, конденсаторы, микроконтроллеры, модули ESP32, датчики, инструменты и комплектующие с доставкой.';
  const url = absoluteUrl('/');

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: 'website',
      url,
      title,
      description,
      siteName: 'Radio Store',
    },
  };
}

export function noIndexMetadata(): Metadata {
  return {
    robots: {
      index: false,
      follow: false,
    },
  };
}

export function noIndexFollowMetadata(): Metadata {
  return {
    robots: {
      index: false,
      follow: true,
    },
  };
}