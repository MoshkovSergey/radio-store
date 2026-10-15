import { FormEvent, useCallback, useEffect, useState } from 'react';

import { api, clearToken, getToken, setToken } from './api';
import type { Cart, Category, Order, Product, User } from './types';

type Route =
	| { page: 'catalog' }
	| { page: 'product'; id: number }
	| { page: 'cart' }
	| { page: 'login' }
	| { page: 'orders' }
	| { page: 'order'; id: number };

const ORDER_STATUS_LABELS: Record<string, string> = {
	new: 'Новый',
	processing: 'В обработке',
	paid: 'Оплачен',
	shipped: 'Отправлен',
	completed: 'Завершён',
	cancelled: 'Отменён',
};

function formatPrice(minor: number, currency: string): string {
	return `${(minor / 100).toFixed(2)} ${currency}`;
}

function formatDate(value: string): string {
	return new Date(value).toLocaleString('ru-RU');
}

function statusLabel(status: string): string {
	return ORDER_STATUS_LABELS[status] ?? status;
}

function formatAttributeValue(value: unknown): string {
	if (value === null || value === undefined) {
		return '—';
	}

	if (typeof value === 'object') {
		return JSON.stringify(value);
	}

	return String(value);
}

export default function App() {
	const [user, setUser] = useState<User | null>(null);
	const [checkingSession, setCheckingSession] = useState(true);
	const [route, setRoute] = useState<Route>({ page: 'catalog' });

	useEffect(() => {
		const listener = () => {
			setUser(null);
		};

		window.addEventListener('auth:logout', listener);
		return () => {
			window.removeEventListener('auth:logout', listener);
		};
	}, []);

	useEffect(() => {
		const token = getToken();

		if (!token) {
			setCheckingSession(false);
			return;
		}

		api
			.me()
			.then((currentUser) => {
				setUser(currentUser);
			})
			.catch(() => {
				clearToken();
				setUser(null);
			})
			.finally(() => {
				setCheckingSession(false);
			});
	}, []);

	const navigate = useCallback((next: Route) => {
		setRoute(next);
		window.scrollTo({ top: 0 });
	}, []);

	function handleAuthSuccess(loggedUser: User) {
		setUser(loggedUser);
		navigate({ page: 'cart' });
	}

	function handleLogout() {
		clearToken();
		setUser(null);
		navigate({ page: 'catalog' });
	}

	if (checkingSession) {
		return <div className="center-screen">Загрузка...</div>;
	}

	return (
		<div className="app-shell">
			<header className="topbar">
				<button className="brand" onClick={() => navigate({ page: 'catalog' })}>
					Radio Store
				</button>

				<nav className="topbar-nav">
					<button className="button" onClick={() => navigate({ page: 'catalog' })}>
						Каталог
					</button>

					{user ? (
						<button className="button" onClick={() => navigate({ page: 'orders' })}>
							Мои заказы
						</button>
					) : null}

					<button className="button" onClick={() => navigate({ page: 'cart' })}>
						Корзина
					</button>

					{user ? (
						<>
							<span className="topbar-user">{user.email}</span>
							<button className="button" onClick={handleLogout}>
								Выйти
							</button>
						</>
					) : (
						<button className="button primary" onClick={() => navigate({ page: 'login' })}>
							Войти
						</button>
					)}
				</nav>
			</header>

			<main className="content">
				{route.page === 'catalog' ? (
					<CatalogPage
						onOpenProduct={(productID) => {
							navigate({ page: 'product', id: productID });
						}}
					/>
				) : null}

				{route.page === 'product' ? (
					<ProductPage id={route.id} user={user} onNavigate={navigate} />
				) : null}

				{route.page === 'cart' ? <CartPage user={user} onNavigate={navigate} /> : null}

				{route.page === 'login' ? <LoginPage onSuccess={handleAuthSuccess} /> : null}

				{route.page === 'orders' ? <OrdersPage user={user} onNavigate={navigate} /> : null}

				{route.page === 'order' ? (
					<OrderPage id={route.id} user={user} onNavigate={navigate} />
				) : null}
			</main>
		</div>
	);
}

function CatalogPage({ onOpenProduct }: { onOpenProduct: (productID: number) => void }) {
	const [categories, setCategories] = useState<Category[]>([]);
	const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
	const [searchInput, setSearchInput] = useState('');
	const [search, setSearch] = useState('');
	const [products, setProducts] = useState<Product[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		api
			.listCategories()
			.then(setCategories)
			.catch((err) => {
				setError(err instanceof Error ? err.message : 'Не удалось загрузить категории');
			});
	}, []);

	useEffect(() => {
		const timer = setTimeout(() => {
			setSearch(searchInput.trim());
		}, 300);

		return () => {
			clearTimeout(timer);
		};
	}, [searchInput]);

	const loadProducts = useCallback(async () => {
		setLoading(true);
		setError('');

		try {
			const response = await api.listProducts({
				category_id: selectedCategory ?? undefined,
				search: search || undefined,
			});
			setProducts(response);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось загрузить товары');
		} finally {
			setLoading(false);
		}
	}, [selectedCategory, search]);

	useEffect(() => {
		void loadProducts();
	}, [loadProducts]);

	return (
		<section>
			<div className="toolbar">
				<input
					className="input search-input"
					placeholder="Поиск: название, SKU, производитель"
					value={searchInput}
					onChange={(event) => setSearchInput(event.target.value)}
				/>
				<button className="button" onClick={() => void loadProducts()}>
					Обновить
				</button>
			</div>

			<div className="chips">
				<button
					className={selectedCategory === null ? 'chip active' : 'chip'}
					onClick={() => setSelectedCategory(null)}
				>
					Все
				</button>

				{categories.map((category) => (
					<button
						key={category.id}
						className={selectedCategory === category.id ? 'chip active' : 'chip'}
						onClick={() => setSelectedCategory(category.id)}
					>
						{category.name}
					</button>
				))}
			</div>

			{error ? <div className="error">{error}</div> : null}

			{loading ? (
				<p>Загрузка товаров...</p>
			) : products.length === 0 ? (
				<div className="card">Товары не найдены.</div>
			) : (
				<div className="product-grid">
					{products.map((product) => (
						<ProductCard
							key={product.id}
							product={product}
							onOpen={() => onOpenProduct(product.id)}
						/>
					))}
				</div>
			)}
		</section>
	);
}

function ProductCard({ product, onOpen }: { product: Product; onOpen: () => void }) {
	return (
		<button className="product-card" onClick={onOpen}>
			<div className="product-name">{product.name}</div>

			<div className="product-meta">
				<div>SKU: {product.sku}</div>
				{product.manufacturer ? <div>Производитель: {product.manufacturer}</div> : null}
			</div>

			<div className="product-price">{formatPrice(product.price_minor, product.currency)}</div>

			{product.stock_quantity > 0 ? (
				<div className="stock ok">В наличии: {product.stock_quantity}</div>
			) : (
				<div className="stock empty">Нет в наличии</div>
			)}
		</button>
	);
}

function ProductPage({
	id,
	user,
	onNavigate,
}: {
	id: number;
	user: User | null;
	onNavigate: (route: Route) => void;
}) {
	const [product, setProduct] = useState<Product | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [quantity, setQuantity] = useState(1);
	const [adding, setAdding] = useState(false);
	const [message, setMessage] = useState('');

	useEffect(() => {
		setLoading(true);
		setError('');

		api
			.getProduct(id)
			.then((response) => {
				setProduct(response);
				setQuantity(1);
			})
			.catch((err) => {
				setError(err instanceof Error ? err.message : 'Не удалось загрузить товар');
			})
			.finally(() => {
				setLoading(false);
			});
	}, [id]);

	async function handleAddToCart() {
		if (!product) {
			return;
		}

		if (!user) {
			onNavigate({ page: 'login' });
			return;
		}

		try {
			setAdding(true);
			setMessage('');
			await api.addCartItem(product.id, quantity);
			onNavigate({ page: 'cart' });
		} catch (err) {
			setMessage(err instanceof Error ? err.message : 'Не удалось добавить товар в корзину');
		} finally {
			setAdding(false);
		}
	}

	if (loading) {
		return <p>Загрузка товара...</p>;
	}

	if (error) {
		return (
			<div className="card">
				<div className="error">{error}</div>
				<button className="button back-button" onClick={() => onNavigate({ page: 'catalog' })}>
					Назад в каталог
				</button>
			</div>
		);
	}

	if (!product) {
		return <p>Товар не найден.</p>;
	}

	const attributes = product.attributes ? Object.entries(product.attributes) : [];
	const inStock = product.stock_quantity > 0;

	return (
		<section className="product-page">
			<button className="button back-button" onClick={() => onNavigate({ page: 'catalog' })}>
				Назад в каталог
			</button>

			<div className="card">
				<h2>{product.name}</h2>

				<div className="muted">
					<div>SKU: {product.sku}</div>
					{product.manufacturer ? <div>Производитель: {product.manufacturer}</div> : null}
				</div>

				<div className="product-page-actions">
					<div className="product-price">
						{formatPrice(product.price_minor, product.currency)}
					</div>

					{inStock ? (
						<span className="badge green">В наличии: {product.stock_quantity}</span>
					) : (
						<span className="badge red">Нет в наличии</span>
					)}

					{product.is_active ? null : <span className="badge red">Товар выключен</span>}
				</div>

				{product.description ? <p>{product.description}</p> : null}

				<div className="product-page-actions">
					<input
						className="input quantity-input"
						type="number"
						min={1}
						max={Math.max(1, product.stock_quantity)}
						value={quantity}
						disabled={!inStock || !product.is_active}
						onChange={(event) => {
							const value = Number(event.target.value);
							if (Number.isNaN(value)) {
								return;
							}

							const maxValue = Math.max(1, product.stock_quantity);
							setQuantity(Math.min(Math.max(1, value), maxValue));
						}}
					/>

					<button
						className="button primary"
						disabled={adding || !inStock || !product.is_active}
						onClick={() => void handleAddToCart()}
					>
						{adding ? 'Добавление...' : 'В корзину'}
					</button>
				</div>

				{message ? <div className="error">{message}</div> : null}

				{!user ? (
					<p className="muted">Чтобы добавить товар в корзину, войдите в аккаунт.</p>
				) : null}
			</div>

			{attributes.length > 0 ? (
				<div className="card">
					<h3>Характеристики</h3>
					<table className="table attributes-table">
						<tbody>
							{attributes.map(([key, value]) => (
								<tr key={key}>
									<td>{key}</td>
									<td>{formatAttributeValue(value)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : null}
		</section>
	);
}

function CartPage({ user, onNavigate }: { user: User | null; onNavigate: (route: Route) => void }) {
	const [cart, setCart] = useState<Cart | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [shippingAddress, setShippingAddress] = useState('');
	const [comment, setComment] = useState('');
	const [processing, setProcessing] = useState(false);

	const load = useCallback(async () => {
		if (!user) {
			return;
		}

		setLoading(true);
		setError('');

		try {
			const response = await api.getCart();
			setCart(response);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось загрузить корзину');
		} finally {
			setLoading(false);
		}
	}, [user]);

	useEffect(() => {
		void load();
	}, [load]);

	async function changeQuantity(productID: number, nextQuantity: number) {
		if (nextQuantity < 1) {
			return;
		}

		try {
			await api.updateCartItem(productID, nextQuantity);
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось изменить количество');
		}
	}

	async function removeItem(productID: number) {
		try {
			await api.deleteCartItem(productID);
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось удалить товар');
		}
	}

	async function handleCheckout(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (!cart || cart.items.length === 0) {
			return;
		}

		try {
			setProcessing(true);
			setError('');

			const result = await api.createOrder(shippingAddress, comment);
			onNavigate({ page: 'order', id: result.id });
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось оформить заказ');
		} finally {
			setProcessing(false);
		}
	}

	if (!user) {
		return <LoginPrompt text="Чтобы посмотреть корзину, войдите в аккаунт." onNavigate={onNavigate} />;
	}

	if (loading) {
		return <p>Загрузка корзины...</p>;
	}

	return (
		<section>
			<h2>Корзина</h2>

			{error ? <div className="error">{error}</div> : null}

			{!cart || cart.items.length === 0 ? (
				<div className="card">
					<p>Корзина пуста.</p>
					<button className="button primary" onClick={() => onNavigate({ page: 'catalog' })}>
						Перейти в каталог
					</button>
				</div>
			) : (
				<div className="card">
					<table className="table">
						<thead>
							<tr>
								<th>Товар</th>
								<th>Цена</th>
								<th>Количество</th>
								<th>Сумма</th>
								<th>Действия</th>
							</tr>
						</thead>
						<tbody>
							{cart.items.map((item) => (
								<tr key={item.product_id}>
									<td>
										<div className="cart-item-name">{item.name}</div>
										<div className="muted small">SKU: {item.sku}</div>
									</td>
									<td>{formatPrice(item.price_minor, item.currency)}</td>
									<td>
										<div className="order-actions">
											<button
												className="button"
												onClick={() => void changeQuantity(item.product_id, item.quantity - 1)}
											>
												−
											</button>
											<span>{item.quantity}</span>
											<button
												className="button"
												onClick={() => void changeQuantity(item.product_id, item.quantity + 1)}
											>
												+
											</button>
										</div>
									</td>
									<td>{formatPrice(item.price_minor * item.quantity, item.currency)}</td>
									<td>
										<button
											className="button danger"
											onClick={() => void removeItem(item.product_id)}
										>
											Удалить
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>

					<div className="cart-summary">
						<div className="total">
							Итого: {formatPrice(cart.total_minor, cart.currency)}
						</div>
					</div>

					<form className="checkout-form" onSubmit={handleCheckout}>
						<h3>Оформление заказа</h3>

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
							<label>Комментарий</label>
							<textarea
								className="textarea"
								value={comment}
								onChange={(event) => setComment(event.target.value)}
							/>
						</div>

						<button className="button primary" disabled={processing}>
							{processing ? 'Оформление...' : 'Оформить заказ'}
						</button>
					</form>
				</div>
			)}
		</section>
	);
}

function LoginPage({ onSuccess }: { onSuccess: (user: User) => void }) {
	const [mode, setMode] = useState<'login' | 'register'>('login');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [fullName, setFullName] = useState('');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError('');
		setLoading(true);

		try {
			if (mode === 'login') {
				const response = await api.login(email, password);
				setToken(response.token);
				onSuccess(response.user);
			} else {
				const response = await api.register(email, password, fullName);
				setToken(response.token);
				onSuccess(response.user);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось выполнить вход');
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="card auth-card">
			<h2>{mode === 'login' ? 'Вход' : 'Регистрация'}</h2>

			<div className="auth-switch">
				<button
					className={mode === 'login' ? 'button primary' : 'button'}
					type="button"
					onClick={() => setMode('login')}
				>
					Вход
				</button>
				<button
					className={mode === 'register' ? 'button primary' : 'button'}
					type="button"
					onClick={() => setMode('register')}
				>
					Регистрация
				</button>
			</div>

			<form onSubmit={handleSubmit}>
				<div className="field">
					<label>Email</label>
					<input
						className="input"
						type="email"
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						required
					/>
				</div>

				{mode === 'register' ? (
					<div className="field">
						<label>Имя и фамилия</label>
						<input
							className="input"
							value={fullName}
							onChange={(event) => setFullName(event.target.value)}
						/>
					</div>
				) : null}

				<div className="field">
					<label>Пароль</label>
					<input
						className="input"
						type="password"
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						required
					/>
				</div>

				{error ? <div className="error">{error}</div> : null}

				<button className="button primary" disabled={loading}>
					{loading ? 'Выполняется...' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
				</button>
			</form>
		</div>
	);
}

function OrdersPage({ user, onNavigate }: { user: User | null; onNavigate: (route: Route) => void }) {
	const [orders, setOrders] = useState<Order[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');

	const load = useCallback(async () => {
		if (!user) {
			return;
		}

		setLoading(true);
		setError('');

		try {
			const response = await api.listOrders();
			setOrders(response);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось загрузить заказы');
		} finally {
			setLoading(false);
		}
	}, [user]);

	useEffect(() => {
		void load();
	}, [load]);

	if (!user) {
		return <LoginPrompt text="Чтобы посмотреть заказы, войдите в аккаунт." onNavigate={onNavigate} />;
	}

	if (loading) {
		return <p>Загрузка заказов...</p>;
	}

	return (
		<section>
			<h2>Мои заказы</h2>

			{error ? <div className="error">{error}</div> : null}

			{orders.length === 0 ? (
				<div className="card">
					<p>Заказов пока нет.</p>
					<button className="button primary" onClick={() => onNavigate({ page: 'catalog' })}>
						Перейти в каталог
					</button>
				</div>
			) : (
				<div className="card">
					<table className="table">
						<thead>
							<tr>
								<th>№</th>
								<th>Дата</th>
								<th>Сумма</th>
								<th>Статус</th>
								<th>Действия</th>
							</tr>
						</thead>
						<tbody>
							{orders.map((order) => (
								<tr key={order.id}>
									<td>{order.id}</td>
									<td>{formatDate(order.created_at)}</td>
									<td>{formatPrice(order.total_minor, order.currency)}</td>
									<td>{statusLabel(order.status)}</td>
									<td>
										<button
											className="button"
											onClick={() => onNavigate({ page: 'order', id: order.id })}
										>
											Открыть
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}

function OrderPage({
	id,
	user,
	onNavigate,
}: {
	id: number;
	user: User | null;
	onNavigate: (route: Route) => void;
}) {
	const [order, setOrder] = useState<Order | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		if (!user) {
			return;
		}

		setLoading(true);
		setError('');

		api
			.getOrder(id)
			.then(setOrder)
			.catch((err) => {
				setError(err instanceof Error ? err.message : 'Не удалось загрузить заказ');
			})
			.finally(() => {
				setLoading(false);
			});
	}, [id, user]);

	if (!user) {
		return <LoginPrompt text="Чтобы посмотреть заказ, войдите в аккаунт." onNavigate={onNavigate} />;
	}

	if (loading) {
		return <p>Загрузка заказа...</p>;
	}

	if (error) {
		return (
			<div className="card">
				<div className="error">{error}</div>
				<button className="button" onClick={() => onNavigate({ page: 'orders' })}>
					Назад к заказам
				</button>
			</div>
		);
	}

	if (!order) {
		return <p>Заказ не найден.</p>;
	}

	return (
		<section>
			<button className="button back-button" onClick={() => onNavigate({ page: 'orders' })}>
				Назад к заказам
			</button>

			<div className="card">
				<h2>Заказ №{order.id}</h2>

				<p>
					<span className="badge blue">{statusLabel(order.status)}</span>{' '}
					<span className="muted">от {formatDate(order.created_at)}</span>
				</p>

				<p>
					<strong>Сумма:</strong>{' '}
					{formatPrice(order.total_minor, order.currency)}
				</p>

				{order.shipping_address ? (
					<p>
						<strong>Адрес доставки:</strong> {order.shipping_address}
					</p>
				) : null}

				{order.comment ? (
					<p>
						<strong>Комментарий:</strong> {order.comment}
					</p>
				) : null}
			</div>

			<div className="card">
				<h3>Состав заказа</h3>

				<table className="table">
					<thead>
						<tr>
							<th>Товар</th>
							<th>SKU</th>
							<th>Количество</th>
							<th>Цена</th>
							<th>Сумма</th>
						</tr>
					</thead>
					<tbody>
						{(order.items ?? []).map((item) => (
							<tr key={item.id}>
								<td>{item.name}</td>
								<td>{item.sku}</td>
								<td>{item.quantity}</td>
								<td>{formatPrice(item.price_minor, order.currency)}</td>
								<td>{formatPrice(item.price_minor * item.quantity, order.currency)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}

function LoginPrompt({ text, onNavigate }: { text: string; onNavigate: (route: Route) => void }) {
	return (
		<div className="card auth-card">
			<p>{text}</p>
			<button className="button primary" onClick={() => onNavigate({ page: 'login' })}>
				Войти или зарегистрироваться
			</button>
		</div>
	);
}