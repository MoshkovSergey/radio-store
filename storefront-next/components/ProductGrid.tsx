import { ProductCard } from './ProductCard';
import type { Product } from '@/lib/types';

/**
 * Количество карточек above the fold, которым ставим priority.
 * Подбери под свой layout: на десктопе в сетке 4-6 карточек в ряд,
 * поэтому 4 — консервативное значение для первого ряда.
 * Если hero-блок сверху съедает первый ряд (главная страница),
 * можно уменьшить до 2.
 */
const PRIORITY_IMAGE_COUNT = 4;

export function ProductGrid({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return (
      <div className="card empty-state">
        <p>Товары не найдены.</p>
      </div>
    );
  }

  return (
    <div className="product-grid">
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          priority={index < PRIORITY_IMAGE_COUNT}
        />
      ))}
    </div>
  );
}