import type { Metadata } from 'next';
import Link from 'next/link';

import { BlogCard } from '@/components/BlogCard';
import { JsonLd } from '@/components/JsonLd';
import { getBlogPosts } from '@/lib/api';
import { absoluteUrl } from '@/lib/seo';
import type { BlogPost } from '@/lib/types';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const title = 'Блог и новости — Radio Store';
  const description =
    'Статьи, обзоры и новости магазина радиодеталей Radio Store: компоненты, модули, инструменты.';
  const url = absoluteUrl('/blog');

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      title,
      description,
      siteName: 'Radio Store',
    },
  };
}

export default async function BlogListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? '1') || 1);
  const limit = 12;
  const offset = (page - 1) * limit;

  const posts = await getBlogPosts({ limit: limit + 1, offset, revalidate: 300 });
  const hasMore = posts.length > limit;
  const visible = posts.slice(0, limit);

  const blogLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Блог Radio Store',
    url: absoluteUrl('/blog'),
    description: 'Статьи и новости магазина радиодеталей Radio Store.',
    publisher: {
      '@type': 'Organization',
      name: 'Radio Store',
      url: absoluteUrl('/'),
    },
  };

  return (
    <section className="blog-page">
      <JsonLd data={blogLd} />

      <div className="toolbar">
        <h1 className="section-heading" style={{ margin: 0 }}>
          Блог и новости
        </h1>
        <Link href="/catalog" className="button">
          В каталог
        </Link>
      </div>

      {visible.length === 0 ? (
        <div className="card empty-state">
          <p>Статей пока нет. Загляните позже.</p>
        </div>
      ) : (
        <div className="blog-grid">
          {visible.map((post: BlogPost) => (
            <BlogCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {hasMore || page > 1 ? (
        <nav className="pagination" aria-label="Пагинация блога">
          {page > 1 ? (
            <Link
              href={page === 2 ? '/blog' : `/blog?page=${page - 1}`}
              className="button"
              rel="prev"
            >
              Назад
            </Link>
          ) : null}

          <span className="muted">Страница {page}</span>

          {hasMore ? (
            <Link href={`/blog?page=${page + 1}`} className="button" rel="next">
              Вперёд
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}