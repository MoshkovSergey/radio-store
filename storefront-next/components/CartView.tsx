'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import { useAuth } from '@/lib/auth-context';
import { clientApi, resolveMediaUrl } from '@/lib/api';
import { formatPrice, getInitials } from '@/lib/format';
import type { Cart } from '@/lib/types';

const EMAIL_REGEXP = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function countDigits(value: string): number {
  let count = 0;

  for (const char of value) {
    if (char >= '0' && char <= '9') {
      count += 1;
    }
  }

  return count;
}

interface FieldErrors {
  address?: string;
  email?: string;
  phone?: string;
}

export function CartView() {
  const router = useRouter();
  const { user, refreshCartCount } = useAuth();

  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState(false);
  const [images, setImages] = useState<Record<number, string>>({});
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const prefilledEmailRef = useRef(false);

  // Предзаполняем email из профиля один раз, чтобы не переписывать
  // поле, когда пользователь начал его редактировать или очистил.
  useEffect(() => {
    if (user && !prefilledEmailRef.current) {
      prefilledEmailRef.current = true;
      setCustomerEmail(user.email);
    }
  }, [user]);

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

  useEffect(() => {
    const items = cart?.items ?? [];
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
  }, [cart]);

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
    const email = customerEmail.trim();
    const phone = customerPhone.trim();

    const errors: FieldErrors = {};

    if (!address) {
      errors.address = 'Укажите адрес доставки';
    }

    if (!EMAIL_REGEXP.test(email)) {
      errors.email = 'Укажите корректный email для отправки документов';
    }

    if (countDigits(phone) < 6) {
      errors.phone = 'Укажите корректный номер телефона';
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const result = await clientApi.createOrder({
        shippingAddress: address,
        comment: comment.trim(),
        customerEmail: email,
        customerPhone: phone,
      });
      await refreshCartCount();
      setShippingAddress('');
      setComment('');
      setProcessing(false);
      router.push(`/orders/${result.id}`);
    } catch (err) {
      setProcessing(false);
      setError(err instanceof Error ? err.message : 'Не удалось оформить заказ');
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
            const imageUrl = resolveMediaUrl(images[item.product_id]);

            return (
              <div key={item.product_id} className="card cart-item">
                <div
                  className="cart-item-image"
                  style={{ position: 'relative', overflow: 'hidden' }}
                >
                  {imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt={item.name}
                      fill
                      sizes="92px"
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    getInitials(item.name)
                  )}
                </div>

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

          <form className="checkout-form" onSubmit={handleCheckout} noValidate>
            <div className="field">
              <label>Адрес доставки</label>
              <input
                className="input"
                value={shippingAddress}
                onChange={(event) => setShippingAddress(event.target.value)}
              />
              {fieldErrors.address ? (
                <span style={{ color: 'var(--danger)', fontSize: 13 }}>
                  {fieldErrors.address}
                </span>
              ) : null}
            </div>

            <div className="field">
              <label>Email для документов</label>
              <input
                className="input"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
              />
              {fieldErrors.email ? (
                <span style={{ color: 'var(--danger)', fontSize: 13 }}>
                  {fieldErrors.email}
                </span>
              ) : (
                <span className="muted" style={{ fontSize: 12 }}>
                  На этот адрес будем отправлять счета и документы.
                </span>
              )}
            </div>

            <div className="field">
              <label>Телефон</label>
              <input
                className="input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+7 900 000-00-00"
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
              />
              {fieldErrors.phone ? (
                <span style={{ color: 'var(--danger)', fontSize: 13 }}>
                  {fieldErrors.phone}
                </span>
              ) : null}
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