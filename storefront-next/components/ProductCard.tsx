import Image from 'next/image';
import Link from 'next/link';

import { resolveMediaUrl } from '@/lib/api';
import { formatPrice, getInitials } from '@/lib/format';
import type { Product } from '@/lib/types';

export function ProductCard({ product }: { product: Product }) {
  const imageUrl = resolveMediaUrl(product.primary_image_url);
  const inStock = product.stock_quantity > 0 && product.is_active;

  return (
    <article className="product-card">
      <Link href={`/product/${product.id}`} className="product-image-link">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1080px) 33vw, 25vw"
            className="product-image"
          />
        ) : (
          <div className="product-image-placeholder">
            <span>{getInitials(product.name)}</span>
          </div>
        )}

        {product.stock_quantity > 0 ? (
          <span className="image-badge">В наличии</span>
        ) : (
          <span className="image-badge out">Нет</span>
        )}
      </Link>

      <div className="product-body">
        <div className="product-price">
          {formatPrice(product.price_minor, product.currency)}
        </div>

        <Link href={`/product/${product.id}`} className="product-name-link">
          {product.name}
        </Link>

        <div className="product-meta">
          {product.manufacturer ?? 'Производитель не указан'}
        </div>

        <div className="product-sku">SKU: {product.sku}</div>

        {!inStock ? (
          <div className="muted" style={{ fontSize: 13 }}>
            Недоступен для заказа
          </div>
        ) : null}
      </div>
    </article>
  );
}