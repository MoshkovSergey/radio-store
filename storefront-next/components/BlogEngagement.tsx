'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getBlogEngagement,
  recordBlogPostView,
  toggleBlogPostLike,
} from '../lib/api';

import type { BlogPostWithStats } from '../lib/api';

type BlogEngagementProps = {
  slug: string;
  initial?: BlogPostWithStats | null;
};

export default function BlogEngagement({ slug, initial }: BlogEngagementProps) {
  const [viewsCount, setViewsCount] = useState<number>(initial?.views_count ?? 0);
  const [likesCount, setLikesCount] = useState<number>(initial?.likes_count ?? 0);
  const [liked, setLiked] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const viewRecordedRef = useRef<boolean>(false);

  useEffect(() => {
    if (viewRecordedRef.current) {
      return;
    }

    viewRecordedRef.current = true;

    let cancelled = false;

    async function loadEngagement() {
      setLoading(true);
      setError('');

      try {
        const viewResponse = await recordBlogPostView(slug);

        if (!cancelled) {
          setViewsCount(viewResponse.views_count);
          setLikesCount(viewResponse.likes_count);
        }

        const engagementResponse = await getBlogEngagement(slug);

        if (!cancelled) {
          setViewsCount(engagementResponse.views_count);
          setLikesCount(engagementResponse.likes_count);
          setLiked(engagementResponse.liked);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Не удалось загрузить статистику статьи',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadEngagement();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handleToggleLike = useCallback(async () => {
    if (busy) {
      return;
    }

    setBusy(true);
    setError('');

    try {
      const response = await toggleBlogPostLike(slug);

      setLiked(response.liked);
      setLikesCount(response.likes_count);
      setViewsCount(response.views_count);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Не удалось изменить лайк',
      );
    } finally {
      setBusy(false);
    }
  }, [busy, slug]);

  return (
    <section
      style={{
        marginTop: '24px',
        paddingTop: '16px',
        borderTop: '1px solid rgba(0, 0, 0, 0.08)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          fontSize: '14px',
          opacity: 0.75,
        }}
      >
        <span>Просмотров: {viewsCount}</span>
        <span>Лайков: {likesCount}</span>
      </div>

      <button
        type="button"
        onClick={() => void handleToggleLike()}
        disabled={loading || busy}
        style={{
          marginLeft: 'auto',
          border: '1px solid rgba(0, 0, 0, 0.16)',
          borderRadius: '999px',
          padding: '8px 14px',
          background: liked ? '#eef4ff' : '#ffffff',
          color: liked ? '#0b5cff' : '#111111',
          cursor: loading || busy ? 'wait' : 'pointer',
          fontWeight: liked ? 700 : 500,
        }}
        aria-pressed={liked}
      >
        {busy ? 'Сохраняем...' : liked ? 'Лайк стоит' : 'Нравится'}
      </button>

      {error ? (
        <div
          style={{
            width: '100%',
            color: '#b42318',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      ) : null}
    </section>
  );
}