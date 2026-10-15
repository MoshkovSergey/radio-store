import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Breadcrumbs } from '@/components/Breadcrumbs';
import { JsonLd } from '@/components/JsonLd';
import Image from 'next/image';
import Link from 'next/link';

import { getAllBlogPostsForSitemap, getBlogPostBySlug, resolveMediaUrl } from '@/lib/api';
import { renderMarkdown } from '@/lib/markdown';
import { formatDate } from '@/lib/format';
import { absoluteUrl } from '@/lib/seo';

export const revalidate = 300;

export async function generateStaticParams() {
  const posts = await getAllBlogPostsForSitemap();

  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);

  if (!post) {
    return { title: 'Статья не найдена' };
  }

  const title = `${post.title} — Radio Store`;
  const description =
    post.excerpt ?? `${post.title}. Статья в блоге Radio Store.`;
  const url = absoluteUrl(`/blog/${post.slug}`);
  const cover = post.cover_image_url ? absoluteUrl(post.cover_image_url) : undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title,
      description,
      siteName: 'Radio Store',
      images: cover ? [cover] : undefined,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const url = absoluteUrl(`/blog/${post.slug}`);
  const coverUrl = resolveMediaUrl(post.cover_image_url);

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt ?? post.title,
    image: coverUrl ? [coverUrl] : undefined,
    datePublished: post.published_at ?? post.created_at,
    dateModified: post.updated_at,
    author: {
      '@type': 'Person',
      name: post.author ?? 'Radio Store',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Radio Store',
      url: absoluteUrl('/'),
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'Блог', item: absoluteUrl('/blog') },
      { '@type': 'ListItem', position: 3, name: post.title, item: url },
    ],
  };

  return (
    <>
      <JsonLd data={[articleLd, breadcrumbLd]} />

      <Breadcrumbs
        items={[
          { label: 'Главная', href: '/' },
          { label: 'Блог', href: '/blog' },
          { label: post.title, href: `/blog/${post.slug}` },
        ]}
      />

      <article className="blog-post">
        <header className="blog-post-header card">
          <h1>{post.title}</h1>

          <div className="blog-post-meta muted small">
            {post.published_at ? `Опубликовано ${formatDate(post.published_at)}` : ''}
            {post.author ? ` · ${post.author}` : ''}
          </div>
        </header>

        {coverUrl ? (
          <div className="blog-post-cover card">
            <Image
              src={coverUrl}
              alt={post.title}
              width={1200}
              height={630}
              sizes="(max-width: 1080px) 100vw, 1080px"
              style={{ width: '100%', height: 'auto', objectFit: 'cover' }}
              priority
            />
          </div>
        ) : null}

        <div className="blog-post-body card markdown-body">
          {renderMarkdown(post.body)}
        </div>

        <footer className="blog-post-footer">
          <Link href="/blog" className="button">
            ← Все статьи
          </Link>
          <Link href="/catalog" className="button primary">
            В каталог
          </Link>
        </footer>
      </article>
    </>
  );
}