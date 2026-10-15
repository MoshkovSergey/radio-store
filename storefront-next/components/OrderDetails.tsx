'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth-context';
import { clientApi, resolveMediaUrl } from '@/lib/api';
import { formatDate, formatPrice, getInitials, orderStatusLabel } from '@/lib/format';
import type { Order } from '@/lib/types';

export function OrderDetails({ orderId }: { orderId: number }) {
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [images, setImages] = useState<Record<number, string>>({});

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

  useEffect(() => {
    const items = order?.items ?? [];
    const ids = items.map((item) => item.product_id);

    if (ids.length === 0) {
      setImages({});
      return;
    }

    let cancelled = false;

    clientApi
      .getProductsPrimaryImages(ids)
      .then((response) => {
        if (cancelled) {
          return;
        }

        const map: Record<number, string> = {};

        for (const entry of response) {
          map[entry.product_id] = entry.primary_image_url;
        }

        setImages(map);
      })
      .catch(() => {
        // Фото не критичны: при ошибке останутся плейсхолдеры.
      });

    return () => {
      cancelled = true;
    };
  }, [order]);

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
  const hasContacts =
    Boolean(order.shipping_address) ||
    Boolean(order.customer_email) ||
    Boolean(order.customer_phone) ||
    Boolean(order.comment);

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

      {hasContacts ? (
        <div className="card order-extra">
          {order.shipping_address ? (
            <div className="order-extra-row">
              <div className="order-extra-label">Адрес доставки</div>
              <div className="order-extra-value">{order.shipping_address}</div>
            </div>
          ) : null}

          {order.customer_email ? (
            <div className="order-extra-row">
              <div className="order-extra-label">Email для документов</div>
              <div className="order-extra-value">{order.customer_email}</div>
            </div>
          ) : null}

          {order.customer_phone ? (
            <div className="order-extra-row">
              <div className="order-extra-label">Телефон</div>
              <div className="order-extra-value">{order.customer_phone}</div>
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
            {items.map((item) => {
              const imageUrl = resolveMediaUrl(images[item.product_id]);

              return (
                <div key={item.id} className="order-item-row">
                  <div
                    className="order-item-image"
                    style={{ position: 'relative', overflow: 'hidden' }}
                  >
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt={item.name}
                        fill
                        sizes="64px"
                        style={{ objectFit: 'cover' }}
                      />
                    ) : (
                      getInitials(item.name)
                    )}
                  </div>

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
              );
            })}
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