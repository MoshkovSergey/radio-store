import Image from 'next/image';
import Link from 'next/link';

import { resolveMediaUrl } from '@/lib/api';
import { formatDateShort, getInitials } from '@/lib/format';
import type { BlogPost } from '@/lib/types';

// Локальный тип для карточки.
// Если общий тип BlogPost ещё не содержит views_count и likes_count,
// карточка всё равно будет работать и покажет 0.
type BlogPostWithStats = BlogPost & {
  views_count?: number;
  likes_count?: number;
};

function formatCount(value: number | undefined): string {
  const numeric = Number(value ?? 0);

  if (!Number.isFinite(numeric)) {
    return '0';
  }

  return String(Math.trunc(numeric));
}

export function BlogCard({ post }: { post: BlogPostWithStats }) {
  const coverUrl = resolveMediaUrl(post.cover_image_url);
  const viewsCount = formatCount(post.views_count);
  const likesCount = formatCount(post.likes_count);

  return (
    <article className="card blog-card">
      <Link href={`/blog/${post.slug}`} className="blog-card-cover">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={post.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1080px) 50vw, 33vw"
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <div className="blog-card-cover-placeholder">
            <span>{getInitials(post.title)}</span>
          </div>
        )}
      </Link>

      <div className="blog-card-body">
        <div className="blog-card-meta muted small">
          {post.published_at ? formatDateShort(post.published_at) : ''}
          {post.author ? ` · ${post.author}` : ''}
        </div>

        <Link href={`/blog/${post.slug}`} className="blog-card-title">
          {post.title}
        </Link>

        {post.excerpt ? (
          <p className="blog-card-excerpt muted">{post.excerpt}</p>
        ) : null}

        <div
          className="muted small"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            marginTop: '10px',
          }}
        >
          <span>Просмотров: {viewsCount}</span>
          <span>Лайков: {likesCount}</span>
        </div>

        <Link href={`/blog/${post.slug}`} className="button secondary">
          Читать
        </Link>
      </div>
    </article>
  );
}