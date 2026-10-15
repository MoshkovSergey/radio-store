import Link from 'next/link';

export function Pagination({
  currentPage,
  hasMore,
  basePath,
}: {
  currentPage: number;
  hasMore: boolean;
  basePath: string;
}) {
  const prevPage = currentPage - 1;
  const nextPage = currentPage + 1;

  const hasPrev = currentPage > 1;

  if (!hasPrev && !hasMore) {
    return null;
  }

  return (
    <nav className="pagination" aria-label="Пагинация">
      {hasPrev ? (
        <Link
          href={
            prevPage === 1
              ? basePath
              : `${basePath}?page=${prevPage}`
          }
          className="button"
          rel="prev"
        >
          Назад
        </Link>
      ) : null}

      <span className="muted">Страница {currentPage}</span>

      {hasMore ? (
        <Link
          href={`${basePath}?page=${nextPage}`}
          className="button"
          rel="next"
        >
          Вперёд
        </Link>
      ) : null}
    </nav>
  );
}