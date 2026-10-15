'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { useAuth } from '@/lib/auth-context';
import { clientApi, resolveMediaUrl } from '@/lib/api';
import { formatPrice, getInitials } from '@/lib/format';
import type { Cart } from '@/lib/types';

import Image from 'next/image';

export function CartView() {
  const router = useRouter();
  const { user, refreshCartCount } = useAuth();

  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState(false);

  const loadCart = useCallback(async () => {
    if (!user) {
      setCart(null);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await clientApi.getCart();
      setCart(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить корзину');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadCart();
  }, [loadCart]);

  async function changeQuantity(productId: number, nextQuantity: number) {
    if (nextQuantity < 1) {
      return;
    }

    try {
      await clientApi.updateCartItem(productId, nextQuantity);
      await refreshCartCount();
      await loadCart();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить количество');
    }
  }

  async function removeItem(productId: number) {
    try {
      await clientApi.deleteCartItem(productId);
      await refreshCartCount();
      await loadCart();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить товар');
    }
  }

  async function handleCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!cart || cart.items.length === 0) {
      return;
    }

    const address = shippingAddress.trim();

    if (!address) {
      setError('Укажите адрес доставки');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const result = await clientApi.createOrder(address, comment.trim());
      await refreshCartCount();
      setShippingAddress('');
      setComment('');
      router.push(`/orders/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось оформить заказ');
    } finally {
      setProcessing(false);
    }
  }

  if (!user) {
    return (
      <div className="card login-prompt">
        <h2>Корзина доступна после входа</h2>
        <p className="muted">
          Войдите или зарегистрируйтесь, чтобы добавлять товары и оформлять заказы.
        </p>
        <button className="button primary" onClick={() => router.push('/login')}>
          Войти
        </button>
      </div>
    );
  }

  if (loading && !cart) {
    return (
      <div className="state-box">
        <div className="spinner" />
      </div>
    );
  }

  if (error && !cart) {
    return (
      <div className="state-box card">
        <div className="error">{error}</div>
        <button className="button" onClick={() => void loadCart()}>
          Повторить
        </button>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="state-box card empty-state">
        <h2>Корзина пуста</h2>
        <p className="muted">Добавьте товары из каталога, чтобы оформить заказ.</p>
        <button className="button primary" onClick={() => router.push('/catalog')}>
          Перейти в каталог
        </button>
      </div>
    );
  }

  const totalQuantity = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <section className="cart-page">
      <h1>Корзина</h1>

      {error ? <div className="error">{error}</div> : null}

      <div className="cart-layout">
        <div className="cart-items">
          {cart.items.map((item) => {
            const imageUrl = resolveMediaUrl(null); // корзина не содержит фото, оставляем инициалы

            return (
              <div key={item.product_id} className="card cart-item">
                <div className="cart-item-image">{getInitials(item.name)}</div>

                <div className="cart-item-info">
                  <div className="cart-item-name">{item.name}</div>
                  <div className="cart-item-sku">SKU: {item.sku}</div>
                  <div className="cart-item-price">
                    {formatPrice(item.price_minor, item.currency)}
                  </div>
                </div>

                <div className="cart-item-controls">
                  <div className="quantity-control small">
                    <button
                      type="button"
                      onClick={() => void changeQuantity(item.product_id, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, item.stock_quantity)}
                      value={item.quantity}
                      onChange={(event) => {
                        const value = Number(event.target.value);

                        if (Number.isNaN(value)) {
                          return;
                        }

                        void changeQuantity(
                          item.product_id,
                          Math.min(Math.max(1, value), Math.max(1, item.stock_quantity)),
                        );
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void changeQuantity(item.product_id, item.quantity + 1)}
                      disabled={item.quantity >= item.stock_quantity}
                    >
                      +
                    </button>
                  </div>

                  <div className="cart-item-sum">
                    {formatPrice(item.price_minor * item.quantity, item.currency)}
                  </div>

                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => void removeItem(item.product_id)}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <aside className="card cart-summary">
          <h2>Ваш заказ</h2>

          <div className="summary-row">
            <span>Товары ({totalQuantity})</span>
            <span>{formatPrice(cart.total_minor, cart.currency)}</span>
          </div>

          <div className="summary-total">
            <span>Итого</span>
            <strong>{formatPrice(cart.total_minor, cart.currency)}</strong>
          </div>

          <form className="checkout-form" onSubmit={handleCheckout}>
            <div className="field">
              <label>Адрес доставки</label>
              <input
                className="input"
                value={shippingAddress}
                onChange={(event) => setShippingAddress(event.target.value)}
                required
              />
            </div>

            <div className="field">
              <label>Комментарий к заказу</label>
              <textarea
                className="textarea"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
            </div>

            <button className="button primary large" disabled={processing}>
              {processing ? 'Оформление...' : 'Оформить заказ'}
            </button>
          </form>
        </aside>
      </div>
    </section>
  );
}