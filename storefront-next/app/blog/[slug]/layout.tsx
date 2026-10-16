import type { ReactNode } from 'react';

import BlogEngagement from '../../../components/BlogEngagement';

type BlogPostLayoutProps = {
  children: ReactNode;
  params: Promise<{
    slug: string;
  }>;
};

export default async function BlogPostLayout({
  children,
  params,
}: BlogPostLayoutProps) {
  const resolvedParams = await params;

  return (
    <>
      {children}
      <BlogEngagement slug={resolvedParams.slug} />
    </>
  );
}