import Link from 'next/link';

import type { Category } from '@/lib/types';

export function CategorySidebar({
  categories,
  selectedId,
}: {
  categories: Category[];
  selectedId: number | null;
}) {
  return (
    <aside className="sidebar">
      <div className="card sidebar-card">
        <div className="sidebar-title">Категории</div>

        <Link
          href="/catalog"
          className={
            selectedId === null ? 'sidebar-link active' : 'sidebar-link'
          }
        >
          Все товары
        </Link>

        {categories.map((category) => (
          <Link
            key={category.id}
            href={`/category/${category.slug}`}
            className={
              selectedId === category.id
                ? 'sidebar-link active'
                : 'sidebar-link'
            }
          >
            {category.name}
          </Link>
        ))}
      </div>
    </aside>
  );
}