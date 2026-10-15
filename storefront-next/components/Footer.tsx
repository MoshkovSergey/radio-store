import Link from 'next/link';

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <span>© {new Date().getFullYear()} Radio Store</span>

        <span>
          <Link href="/catalog">Каталог</Link>
          {' · '}
          <Link href="/search">Поиск</Link>
        </span>
      </div>
    </footer>
  );
}