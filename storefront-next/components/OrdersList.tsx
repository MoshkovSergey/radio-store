'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth-context';
import { clientApi } from '@/lib/api';
import { formatDate, formatPrice, orderStatusLabel } from '@/lib/format';
import type { Order } from '@/lib/types';

export function OrdersList() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadOrders = useCallback(async () => {
    if (!user) {
      setOrders([]);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await clientApi.listOrders();
      setOrders(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить заказы');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  if (!user) {
    return (
      <div className="card login-prompt">
        <h2>Заказы доступны после входа</h2>
        <p className="muted">Войдите, чтобы посмотреть историю заказов.</p>
        <Link href="/login" className="button primary">
          Войти
        </Link>
      </div>
    );
  }

  if (loading && orders.length === 0) {
    return (
      <div className="state-box">
        <div className="spinner" />
      </div>
    );
  }

  if (error && orders.length === 0) {
    return (
      <div className="state-box card">
        <div className="error">{error}</div>
        <button className="button" onClick={() => void loadOrders()}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <section className="orders-page">
      <h1>Мои заказы</h1>

      {orders.length === 0 ? (
        <div className="card empty-state">
          <p>Заказов пока нет.</p>
          <Link href="/catalog" className="button primary">
            Перейти в каталог
          </Link>
        </div>
      ) : (
        orders.map((order) => (
          <article key={order.id} className="card order-card">
            <header className="order-card-head">
              <div>
                <div className="order-id">Заказ №{order.id}</div>
                <div className="muted">Оформлен {formatDate(order.created_at)}</div>
              </div>

              <span className={`status-badge status-${order.status}`}>
                {orderStatusLabel(order.status)}
              </span>
            </header>

            <div className="order-card-body">
              <div className="order-card-field">
                <span className="order-card-label">Сумма</span>
                <span className="order-card-value">
                  {formatPrice(order.total_minor, order.currency)}
                </span>
              </div>

              {order.shipping_address ? (
                <div className="order-card-field">
                  <span className="order-card-label">Адрес доставки</span>
                  <span className="order-card-value">{order.shipping_address}</span>
                </div>
              ) : null}
            </div>

            <footer className="order-footer">
              <Link href={`/orders/${order.id}`} className="button primary">
                Подробнее
              </Link>
            </footer>
          </article>
        ))
      )}
    </section>
  );
}