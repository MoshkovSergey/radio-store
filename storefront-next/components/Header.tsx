'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/lib/auth-context';

export function Header() {
  const router = useRouter();
  const { user, cartCount, logout } = useAuth();

  return (
    <header className="header">
      <div className="header-inner">
        <Link href="/" className="logo">
          <span className="logo-mark">RS</span>
          <span className="logo-text">Radio Store</span>
        </Link>

        <nav className="header-actions">
          <Link href="/catalog" className="header-action">
            Каталог
          </Link>

          <Link href="/blog" className="header-action">
            Блог
          </Link>

          {user ? (
            <Link href="/orders" className="header-action">
              Заказы
            </Link>
          ) : null}

          <Link href="/cart" className="header-action">
            Корзина
            {cartCount !== null && cartCount > 0 ? (
              <span className="cart-badge">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            ) : null}
          </Link>

          {user ? (
            <>
              <span className="header-email">{user.email}</span>
              <button
                className="button"
                onClick={() => {
                  logout();
                  router.push('/');
                }}
              >
                Выйти
              </button>
            </>
          ) : (
            <Link href="/login" className="button primary">
              Войти
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}