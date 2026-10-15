'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useAuth } from '@/lib/auth-context';
import { formatPrice } from '@/lib/format';

export function BuyPanel({
  productId,
  name,
  sku,
  manufacturer,
  description,
  priceMinor,
  currency,
  stockQuantity,
  isActive,
}: {
  productId: number;
  name: string;
  sku: string;
  manufacturer: string | null;
  description: string | null;
  priceMinor: number;
  currency: string;
  stockQuantity: number;
  isActive: boolean;
}) {
  const router = useRouter();
  const { user, addToCart } = useAuth();

  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState('');

  const canAdd = stockQuantity > 0 && isActive;
  const maxQuantity = Math.max(1, stockQuantity);

  function changeQuantity(delta: number) {
    setQuantity((previous) => {
      const next = previous + delta;

      if (next < 1) {
        return 1;
      }

      if (next > maxQuantity) {
        return maxQuantity;
      }

      return next;
    });
  }

  async function handleAdd(goToCart: boolean) {
    if (!user) {
      router.push('/login');
      return;
    }

    setAdding(true);
    setMessage('');

    try {
      await addToCart(productId, quantity);

      if (goToCart) {
        router.push('/cart');
        return;
      }

      setMessage('Товар добавлен в корзину');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Не удалось добавить товар');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="card buy-panel">
      <h1>{name}</h1>

      <div className="product-short-meta">
        {manufacturer ? <span>{manufacturer}</span> : null}
        <span>SKU: {sku}</span>
      </div>

      <div className="price-block">
        <div className="current-price">{formatPrice(priceMinor, currency)}</div>

        {stockQuantity > 0 ? (
          <span className="stock-badge in">В наличии: {stockQuantity}</span>
        ) : (
          <span className="stock-badge out">Нет в наличии</span>
        )}

        {!isActive ? <span className="stock-badge out">Товар выключен</span> : null}
      </div>

      {description ? <p className="description">{description}</p> : null}

      <div className="quantity-row">
        <span className="quantity-label">Количество</span>

        <div className="quantity-control">
          <button type="button" onClick={() => changeQuantity(-1)} disabled={!canAdd}>
            −
          </button>
          <input
            type="number"
            min={1}
            max={maxQuantity}
            value={quantity}
            disabled={!canAdd}
            onChange={(event) => {
              const value = Number(event.target.value);

              if (Number.isNaN(value)) {
                return;
              }

              setQuantity(Math.min(Math.max(1, value), maxQuantity));
            }}
          />
          <button type="button" onClick={() => changeQuantity(1)} disabled={!canAdd}>
            +
          </button>
        </div>
      </div>

      <div className="buy-actions">
        <button
          className="button primary large"
          disabled={!canAdd || adding}
          onClick={() => void handleAdd(false)}
        >
          {adding ? 'Добавление...' : 'В корзину'}
        </button>

        <button
          className="button secondary large"
          disabled={!canAdd || adding}
          onClick={() => void handleAdd(true)}
        >
          Купить сейчас
        </button>
      </div>

      {message ? <div className="inline-message">{message}</div> : null}

      {!user ? <p className="hint">Войдите, чтобы добавить товар в корзину.</p> : null}
    </div>
  );
}