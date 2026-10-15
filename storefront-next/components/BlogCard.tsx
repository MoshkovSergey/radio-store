import Image from 'next/image';
import Link from 'next/link';

import { resolveMediaUrl } from '@/lib/api';
import { formatDateShort, getInitials } from '@/lib/format';
import type { BlogPost } from '@/lib/types';

export function BlogCard({ post }: { post: BlogPost }) {
  const coverUrl = resolveMediaUrl(post.cover_image_url);

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

        <Link href={`/blog/${post.slug}`} className="button secondary">
          Читать
        </Link>
      </div>
    </article>
  );
}