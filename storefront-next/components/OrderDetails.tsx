'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth-context';
import { clientApi } from '@/lib/api';
import { formatDate, formatPrice, getInitials, orderStatusLabel } from '@/lib/format';
import type { Order } from '@/lib/types';

export function OrderDetails({ orderId }: { orderId: number }) {
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !Number.isFinite(orderId) || orderId <= 0) {
      return;
    }

    let cancelled = false;

    setLoading(true);
    setError('');

    clientApi
      .getOrder(orderId)
      .then((response) => {
        if (!cancelled) {
          setOrder(response);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Не удалось загрузить заказ');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [orderId, user]);

  if (!user) {
    return (
      <div className="card login-prompt">
        <h2>Заказ доступен после входа</h2>
        <Link href="/login" className="button primary">
          Войти
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="state-box">
        <div className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="state-box card">
        <div className="error">{error}</div>
        <Link href="/orders" className="button">
          Назад к заказам
        </Link>
      </div>
    );
  }

  if (!order) {
    return <div className="state-box card">Заказ не найден.</div>;
  }

  const items = order.items ?? [];
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <section className="order-page">
      <Link href="/orders" className="button back-button">
        ← Назад к заказам
      </Link>

      <div className="order-hero card">
        <div className="order-hero-left">
          <div className="order-hero-label">Заказ</div>
          <h1 className="order-hero-number">№{order.id}</h1>
          <div className="muted">Оформлен {formatDate(order.created_at)}</div>
        </div>

        <div className="order-hero-right">
          <span className={`status-badge status-${order.status}`}>
            {orderStatusLabel(order.status)}
          </span>
          <div className="order-hero-total">
            {formatPrice(order.total_minor, order.currency)}
          </div>
        </div>
      </div>

      <div className="order-info-grid">
        <div className="card info-card">
          <div className="info-card-label">Статус</div>
          <div className="info-card-value">{orderStatusLabel(order.status)}</div>
        </div>

        <div className="card info-card">
          <div className="info-card-label">Сумма</div>
          <div className="info-card-value">
            {formatPrice(order.total_minor, order.currency)}
          </div>
        </div>

        <div className="card info-card">
          <div className="info-card-label">Позиций</div>
          <div className="info-card-value">
            {items.length} шт. · {totalQuantity} ед.
          </div>
        </div>

        <div className="card info-card">
          <div className="info-card-label">Дата оформления</div>
          <div className="info-card-value">{formatDate(order.created_at)}</div>
        </div>
      </div>

      {order.shipping_address || order.comment ? (
        <div className="card order-extra">
          {order.shipping_address ? (
            <div className="order-extra-row">
              <div className="order-extra-label">Адрес доставки</div>
              <div className="order-extra-value">{order.shipping_address}</div>
            </div>
          ) : null}

          {order.comment ? (
            <div className="order-extra-row">
              <div className="order-extra-label">Комментарий</div>
              <div className="order-extra-value">{order.comment}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="card order-items-card">
        <h2 className="section-title">Состав заказа</h2>

        {items.length === 0 ? (
          <p className="muted">Состав заказа не найден.</p>
        ) : (
          <div className="order-items-list">
            {items.map((item) => (
              <div key={item.id} className="order-item-row">
                <div className="order-item-image">{getInitials(item.name)}</div>

                <div className="order-item-info">
                  <div className="order-item-name">{item.name}</div>
                  <div className="order-item-sku">SKU: {item.sku}</div>
                </div>

                <div className="order-item-qty">
                  {item.quantity} × {formatPrice(item.price_minor, order.currency)}
                </div>

                <div className="order-item-sum">
                  {formatPrice(item.price_minor * item.quantity, order.currency)}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="order-total-row">
          <span>Итого</span>
          <strong>{formatPrice(order.total_minor, order.currency)}</strong>
        </div>
      </div>
    </section>
  );
}