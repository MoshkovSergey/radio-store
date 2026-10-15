import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="card empty-state">
      <h1>Страница не найдена</h1>
      <p className="muted">
        Возможно, товар снят с продажи или ссылка устарела.
      </p>
      <Link href="/catalog" className="button primary">
        Перейти в каталог
      </Link>
    </div>
  );
}