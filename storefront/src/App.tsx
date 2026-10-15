import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { api, clearToken, getToken, resolveMediaUrl, setToken } from './api';
import type { Cart, Category, Order, Product, ProductImage, User } from './types';

type Route =
	| { page: 'catalog' }
	| { page: 'product'; id: number }
	| { page: 'cart' }
	| { page: 'login' }
	| { page: 'orders' }
	| { page: 'order'; id: number };

type SortOption = 'default' | 'price_asc' | 'price_desc' | 'name';

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

function getInitials(value: string): string {
	const cleaned = value.trim();

	if (!cleaned) {
		return 'RS';
	}

	const parts = cleaned.split(/\s+/).filter(Boolean);

	if (parts.length >= 2) {
		return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
	}

	return cleaned.slice(0, 2).toUpperCase();
}

function notifyCartUpdated(): void {
	window.dispatchEvent(new Event('cart:updated'));
}

function MediaThumb({
	url,
	name,
	className,
}: {
	url?: string | null;
	name: string;
	className: string;
}) {
	const resolved = resolveMediaUrl(url);

	if (resolved) {
		return <img className={className} src={resolved} alt={name} loading="lazy" />;
	}

	return (
		<div className={`${className} placeholder`}>
			<span>{getInitials(name)}</span>
		</div>
	);
}

export default function App() {
	const [user, setUser] = useState<User | null>(null);
	const [checkingSession, setCheckingSession] = useState(true);
	const [route, setRoute] = useState<Route>({ page: 'catalog' });
	const [cartCount, setCartCount] = useState<number | null>(null);

	const navigate = useCallback((next: Route) => {
		setRoute(next);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}, []);

	const refreshCartCount = useCallback(async () => {
		if (!user) {
			setCartCount(null);
			return;
		}

		try {
			const cart = await api.getCart();
			const count = cart.items.reduce((sum, item) => sum + item.quantity, 0);
			setCartCount(count);
		} catch {
			setCartCount(null);
		}
	}, [user]);

	useEffect(() => {
		const handleLogoutEvent = () => {
			setUser(null);
			setCartCount(null);
		};

		window.addEventListener('auth:logout', handleLogoutEvent);

		return () => {
			window.removeEventListener('auth:logout', handleLogoutEvent);
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

	useEffect(() => {
		void refreshCartCount();
	}, [refreshCartCount]);

	useEffect(() => {
		const handleCartUpdated = () => {
			void refreshCartCount();
		};

		window.addEventListener('cart:updated', handleCartUpdated);

		return () => {
			window.removeEventListener('cart:updated', handleCartUpdated);
		};
	}, [refreshCartCount]);

	function handleLoginSuccess(loggedUser: User) {
		setUser(loggedUser);
		navigate({ page: 'catalog' });
	}

	function handleLogout() {
		clearToken();
		setUser(null);
		setCartCount(null);
		navigate({ page: 'catalog' });
	}

	if (checkingSession) {
		return (
			<div className="page-loader">
				<div className="spinner" />
			</div>
		);
	}

	return (
		<div className="marketplace">
			<header className="header">
				<div className="header-inner">
					<button className="logo" onClick={() => navigate({ page: 'catalog' })}>
						<span className="logo-mark">RS</span>
						<span className="logo-text">Radio Store</span>
					</button>

					<nav className="header-actions">
						<button className="header-action" onClick={() => navigate({ page: 'catalog' })}>
							Каталог
						</button>

						{user ? (
							<button className="header-action" onClick={() => navigate({ page: 'orders' })}>
								Заказы
							</button>
						) : null}

						<button
							className="header-action cart-action"
							onClick={() => navigate({ page: 'cart' })}
						>
							Корзина
							{cartCount !== null && cartCount > 0 ? (
								<span className="cart-badge">{cartCount > 99 ? '99+' : cartCount}</span>
							) : null}
						</button>

						{user ? (
							<>
								<span className="header-email">{user.email}</span>
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
				</div>
			</header>

			<main className="main">
				{route.page === 'catalog' ? (
					<CatalogPage
						user={user}
						onOpenProduct={(productID) => navigate({ page: 'product', id: productID })}
						onRequireAuth={() => navigate({ page: 'login' })}
					/>
				) : null}

				{route.page === 'product' ? (
					<ProductPage id={route.id} user={user} onNavigate={navigate} />
				) : null}

				{route.page === 'cart' ? <CartPage user={user} onNavigate={navigate} /> : null}

				{route.page === 'login' ? <LoginPage onSuccess={handleLoginSuccess} /> : null}

				{route.page === 'orders' ? <OrdersPage user={user} onNavigate={navigate} /> : null}

				{route.page === 'order' ? (
					<OrderPage id={route.id} user={user} onNavigate={navigate} />
				) : null}
			</main>

			<footer className="footer">
				<div className="footer-inner">
					<span>© 2026 Radio Store</span>
					<span>Магазин радиодеталей, модулей и инструментов</span>
				</div>
			</footer>
		</div>
	);
}

function CatalogPage({
	user,
	onOpenProduct,
	onRequireAuth,
}: {
	user: User | null;
	onOpenProduct: (productID: number) => void;
	onRequireAuth: () => void;
}) {
	const [categories, setCategories] = useState<Category[]>([]);
	const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
	const [searchInput, setSearchInput] = useState('');
	const [search, setSearch] = useState('');
	const [products, setProducts] = useState<Product[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [sort, setSort] = useState<SortOption>('default');
	const [visibleCount, setVisibleCount] = useState(24);
	const [toast, setToast] = useState('');
	const [addingProductId, setAddingProductId] = useState<number | null>(null);

	useEffect(() => {
		api
			.listCategories()
			.then(setCategories)
			.catch(() => {
				// Категории не критичны для рендера каталога.
			});
	}, []);

	useEffect(() => {
		const timer = setTimeout(() => {
			setSearch(searchInput.trim());
		}, 350);

		return () => {
			clearTimeout(timer);
		};
	}, [searchInput]);

	useEffect(() => {
		setVisibleCount(24);
	}, [selectedCategory, search, sort]);

	const loadProducts = useCallback(async () => {
		setLoading(true);
		setError('');

		try {
			const response = await api.listProducts({
				category_id: selectedCategory ?? undefined,
				search: search || undefined,
				limit: 100,
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

	const sortedProducts = useMemo(() => {
		const items = [...products];

		if (sort === 'price_asc') {
			items.sort((a, b) => a.price_minor - b.price_minor);
		} else if (sort === 'price_desc') {
			items.sort((a, b) => b.price_minor - a.price_minor);
		} else if (sort === 'name') {
			items.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
		}

		return items;
	}, [products, sort]);

	const visibleProducts = sortedProducts.slice(0, visibleCount);
	const hasMore = sortedProducts.length > visibleCount;

	function showToast(message: string) {
		setToast(message);
		window.setTimeout(() => setToast(''), 2200);
	}

	async function quickAdd(product: Product) {
		if (!user) {
			onRequireAuth();
			return;
		}

		setAddingProductId(product.id);

		try {
			await api.addCartItem(product.id, 1);
			notifyCartUpdated();
			showToast('Товар добавлен в корзину');
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Не удалось добавить товар');
		} finally {
			setAddingProductId(null);
		}
	}

	return (
		<section className="catalog">
			<div className="catalog-layout">
				<aside className="sidebar">
					<div className="card sidebar-card">
						<div className="sidebar-title">Категории</div>

						<button
							type="button"
							className={selectedCategory === null ? 'sidebar-link active' : 'sidebar-link'}
							onClick={() => setSelectedCategory(null)}
						>
							Все товары
						</button>

						{categories.map((category) => (
							<button
								key={category.id}
								type="button"
								className={
									selectedCategory === category.id ? 'sidebar-link active' : 'sidebar-link'
								}
								onClick={() => setSelectedCategory(category.id)}
							>
								{category.name}
							</button>
						))}
					</div>
				</aside>

				<div className="catalog-main">
					<div className="hero">
						<div className="hero-content">
							<div className="hero-badge">Магазин радиодеталей</div>
							<h1>Компоненты, модули и инструменты для ваших проектов</h1>
							<p>
								Резисторы, конденсаторы, микроконтроллеры, ESP32, датчики, инструменты и многое
								другое.
							</p>

							<div className="hero-search">
								<input
									className="input"
									placeholder="Поиск по названию, SKU или производителю"
									value={searchInput}
									onChange={(event) => setSearchInput(event.target.value)}
								/>
								<button className="button primary" onClick={() => void loadProducts()}>
									Найти
								</button>
							</div>
						</div>
					</div>

					<div className="mobile-chips">
						<button
							type="button"
							className={selectedCategory === null ? 'chip active' : 'chip'}
							onClick={() => setSelectedCategory(null)}
						>
							Все
						</button>

						{categories.map((category) => (
							<button
								key={category.id}
								type="button"
								className={selectedCategory === category.id ? 'chip active' : 'chip'}
								onClick={() => setSelectedCategory(category.id)}
							>
								{category.name}
							</button>
						))}
					</div>

					<div className="toolbar">
						<div className="results-count">
							{loading ? 'Загрузка...' : `Найдено: ${sortedProducts.length}`}
						</div>

						<select
							className="select compact"
							value={sort}
							onChange={(event) => setSort(event.target.value as SortOption)}
							aria-label="Сортировка"
						>
							<option value="default">По умолчанию</option>
							<option value="price_asc">Сначала дешевле</option>
							<option value="price_desc">Сначала дороже</option>
							<option value="name">По названию</option>
						</select>
					</div>

					{error && products.length > 0 ? <div className="error">{error}</div> : null}

					{toast ? <div className="toast">{toast}</div> : null}

					{loading && products.length === 0 ? (
						<div className="state-box">
							<div className="spinner" />
						</div>
					) : error && products.length === 0 ? (
						<div className="state-box card">
							<div className="error">{error}</div>
							<button className="button" onClick={() => void loadProducts()}>
								Повторить
							</button>
						</div>
					) : visibleProducts.length === 0 ? (
						<div className="state-box card empty-state">
							<h3>Ничего не найдено</h3>
							<p className="muted">Попробуйте изменить запрос или выбрать другую категорию.</p>
							<button
								className="button primary"
								onClick={() => {
									setSearchInput('');
									setSearch('');
									setSelectedCategory(null);
								}}
							>
								Сбросить фильтры
							</button>
						</div>
					) : (
						<div className="product-grid">
							{visibleProducts.map((product) => (
								<ProductCard
									key={product.id}
									product={product}
									isAdding={addingProductId === product.id}
									onOpen={() => onOpenProduct(product.id)}
									onQuickAdd={() => void quickAdd(product)}
								/>
							))}
						</div>
					)}

					{hasMore ? (
						<div className="load-more">
							<button className="button" onClick={() => setVisibleCount((count) => count + 24)}>
								Показать ещё
							</button>
						</div>
					) : null}
				</div>
			</div>
		</section>
	);
}

function ProductCard({
	product,
	isAdding,
	onOpen,
	onQuickAdd,
}: {
	product: Product;
	isAdding: boolean;
	onOpen: () => void;
	onQuickAdd: () => void;
}) {
	const inStock = product.stock_quantity > 0 && product.is_active;

	return (
		<article className="product-card">
			<button type="button" className="product-image" onClick={onOpen}>
				<MediaThumb url={product.primary_image_url} name={product.name} className="product-img" />

				{product.stock_quantity > 0 ? (
					<span className="image-badge">В наличии</span>
				) : (
					<span className="image-badge out">Нет</span>
				)}
			</button>

			<div className="product-body">
				<div className="product-price-line">
					<span className="product-price">{formatPrice(product.price_minor, product.currency)}</span>
				</div>

				<button type="button" className="product-name" onClick={onOpen}>
					{product.name}
				</button>

				<div className="product-meta">{product.manufacturer ?? 'Производитель не указан'}</div>
				<div className="product-sku">SKU: {product.sku}</div>

				<button
					type="button"
					className="button primary product-add"
					disabled={!inStock || isAdding}
					onClick={onQuickAdd}
				>
					{isAdding ? 'Добавление...' : 'В корзину'}
				</button>
			</div>
		</article>
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
	const [selectedImage, setSelectedImage] = useState<ProductImage | null>(null);

	useEffect(() => {
		let cancelled = false;

		setLoading(true);
		setError('');

		api
			.getProduct(id)
			.then((response) => {
				if (!cancelled) {
					setProduct(response);
					setQuantity(1);

					const images = response.images ?? [];
					const primary = images.find((image) => image.is_primary) ?? images[0] ?? null;
					setSelectedImage(primary);
				}
			})
			.catch((err) => {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : 'Не удалось загрузить товар');
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
	}, [id]);

	function changeQuantity(delta: number) {
		if (!product) {
			return;
		}

		const maxQuantity = Math.max(1, product.stock_quantity);

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

	async function addToCart(goToCart: boolean) {
		if (!product) {
			return;
		}

		if (!user) {
			onNavigate({ page: 'login' });
			return;
		}

		setAdding(true);
		setMessage('');

		try {
			await api.addCartItem(product.id, quantity);
			notifyCartUpdated();

			if (goToCart) {
				setAdding(false);
				onNavigate({ page: 'cart' });
				return;
			}

			setAdding(false);
			setMessage('Товар добавлен в корзину');
		} catch (err) {
			setAdding(false);
			setMessage(err instanceof Error ? err.message : 'Не удалось добавить товар в корзину');
		}
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
				<button className="button" onClick={() => onNavigate({ page: 'catalog' })}>
					Назад в каталог
				</button>
			</div>
		);
	}

	if (!product) {
		return <div className="state-box card">Товар не найден.</div>;
	}

	const canAdd = product.stock_quantity > 0 && product.is_active;
	const attributeEntries = Object.entries(product.attributes || {});
	const images = product.images ?? [];
	const mainImage = selectedImage ?? (images.find((image) => image.is_primary) ?? images[0] ?? null);

	return (
		<section className="product-page">
			<button className="button back-button" onClick={() => onNavigate({ page: 'catalog' })}>
				← Назад в каталог
			</button>

			<div className="breadcrumbs">
				<button onClick={() => onNavigate({ page: 'catalog' })}>Каталог</button>
				<span>/</span>
				<span>{product.name}</span>
			</div>

			<div className="product-detail-grid">
				<div className="card product-gallery">
					<div className="gallery-main">
						<MediaThumb url={mainImage?.url} name={product.name} className="gallery-img" />
					</div>

					{images.length > 1 ? (
						<div className="gallery-thumbs">
							{images.map((image) => (
								<button
									key={image.id}
									type="button"
									className={
										mainImage && mainImage.id === image.id
											? 'gallery-thumb active'
											: 'gallery-thumb'
									}
									onClick={() => setSelectedImage(image)}
								>
									<img src={resolveMediaUrl(image.url)} alt={image.alt ?? product.name} />
								</button>
							))}
						</div>
					) : null}
				</div>

				<div className="card buy-panel">
					<h1>{product.name}</h1>

					<div className="product-short-meta">
						{product.manufacturer ? <span>{product.manufacturer}</span> : null}
						<span>SKU: {product.sku}</span>
					</div>

					<div className="price-block">
						<div className="current-price">{formatPrice(product.price_minor, product.currency)}</div>

						{product.stock_quantity > 0 ? (
							<span className="stock-badge in">В наличии: {product.stock_quantity}</span>
						) : (
							<span className="stock-badge out">Нет в наличии</span>
						)}

						{!product.is_active ? <span className="stock-badge out">Товар выключен</span> : null}
					</div>

					{product.description ? <p className="description">{product.description}</p> : null}

					<div className="quantity-row">
						<span className="quantity-label">Количество</span>

						<div className="quantity-control">
							<button type="button" onClick={() => changeQuantity(-1)} disabled={!canAdd}>
								−
							</button>
							<input
								type="number"
								min={1}
								max={Math.max(1, product.stock_quantity)}
								value={quantity}
								disabled={!canAdd}
								onChange={(event) => {
									const value = Number(event.target.value);

									if (Number.isNaN(value)) {
										return;
									}

									const maxQuantity = Math.max(1, product.stock_quantity);
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
							onClick={() => void addToCart(false)}
						>
							{adding ? 'Добавление...' : 'В корзину'}
						</button>

						<button
							className="button secondary large"
							disabled={!canAdd || adding}
							onClick={() => void addToCart(true)}
						>
							Купить сейчас
						</button>
					</div>

					{message ? <div className="inline-message">{message}</div> : null}

					{!user ? <p className="hint">Войдите, чтобы добавить товар в корзину.</p> : null}
				</div>
			</div>

			<div className="card specs-card">
				<h2>Характеристики</h2>

				<table className="table specs-table">
					<tbody>
						<tr>
							<td>SKU</td>
							<td>{product.sku}</td>
						</tr>

						{product.manufacturer ? (
							<tr>
								<td>Производитель</td>
								<td>{product.manufacturer}</td>
							</tr>
						) : null}

						<tr>
							<td>Остаток</td>
							<td>{product.stock_quantity}</td>
						</tr>

						<tr>
							<td>Валюта</td>
							<td>{product.currency}</td>
						</tr>

						{attributeEntries.map(([key, value]) => (
							<tr key={key}>
								<td>{key}</td>
								<td>{formatAttributeValue(value)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}

function CartPage({
	user,
	onNavigate,
}: {
	user: User | null;
	onNavigate: (route: Route) => void;
}) {
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
			const response = await api.getCart();
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
			await api.updateCartItem(productId, nextQuantity);
			notifyCartUpdated();
			await loadCart();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось изменить количество');
		}
	}

	async function removeItem(productId: number) {
		try {
			await api.deleteCartItem(productId);
			notifyCartUpdated();
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
			const result = await api.createOrder(address, comment.trim());
			notifyCartUpdated();
			setShippingAddress('');
			setComment('');
			setProcessing(false);
			onNavigate({ page: 'order', id: result.id });
		} catch (err) {
			setProcessing(false);
			setError(err instanceof Error ? err.message : 'Не удалось оформить заказ');
		}
	}

	if (!user) {
		return (
			<div className="card login-prompt">
				<h2>Корзина доступна после входа</h2>
				<p className="muted">Войдите или зарегистрируйтесь, чтобы добавлять товары и оформлять заказы.</p>
				<button className="button primary" onClick={() => onNavigate({ page: 'login' })}>
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
				<button className="button primary" onClick={() => onNavigate({ page: 'catalog' })}>
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
					{cart.items.map((item) => (
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
					))}
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
				setLoading(false);
				onSuccess(response.user);
				return;
			}

			const response = await api.register(email, password, fullName);
			setToken(response.token);
			setLoading(false);
			onSuccess(response.user);
		} catch (err) {
			setLoading(false);
			setError(err instanceof Error ? err.message : 'Не удалось выполнить вход');
		}
	}

	return (
		<div className="auth-wrap">
			<div className="card auth-card">
				<h1 className="auth-title">{mode === 'login' ? 'Вход в аккаунт' : 'Регистрация'}</h1>

				<div className="auth-tabs">
					<button
						type="button"
						className={mode === 'login' ? 'auth-tab active' : 'auth-tab'}
						onClick={() => setMode('login')}
					>
						Вход
					</button>
					<button
						type="button"
						className={mode === 'register' ? 'auth-tab active' : 'auth-tab'}
						onClick={() => setMode('register')}
					>
						Регистрация
					</button>
				</div>

				<form className="auth-form" onSubmit={handleSubmit}>
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

					<button className="button primary large" disabled={loading}>
						{loading ? 'Выполняется...' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
					</button>
				</form>
			</div>
		</div>
	);
}

function OrdersPage({
	user,
	onNavigate,
}: {
	user: User | null;
	onNavigate: (route: Route) => void;
}) {
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
			const response = await api.listOrders();
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
				<button className="button primary" onClick={() => onNavigate({ page: 'login' })}>
					Войти
				</button>
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
					<button className="button primary" onClick={() => onNavigate({ page: 'catalog' })}>
						Перейти в каталог
					</button>
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
								{statusLabel(order.status)}
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
							<button
								className="button primary"
								onClick={() => onNavigate({ page: 'order', id: order.id })}
							>
								Подробнее
							</button>
						</footer>
					</article>
				))
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

		let cancelled = false;

		setLoading(true);
		setError('');

		api
			.getOrder(id)
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
	}, [id, user]);

	if (!user) {
		return (
			<div className="card login-prompt">
				<h2>Заказ доступен после входа</h2>
				<button className="button primary" onClick={() => onNavigate({ page: 'login' })}>
					Войти
				</button>
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
				<button className="button" onClick={() => onNavigate({ page: 'orders' })}>
					Назад к заказам
				</button>
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
			<button className="button back-button" onClick={() => onNavigate({ page: 'orders' })}>
				← Назад к заказам
			</button>

			<div className="order-hero card">
				<div className="order-hero-left">
					<div className="order-hero-label">Заказ</div>
					<h1 className="order-hero-number">№{order.id}</h1>
					<div className="muted">Оформлен {formatDate(order.created_at)}</div>
				</div>

				<div className="order-hero-right">
					<span className={`status-badge status-${order.status}`}>
						{statusLabel(order.status)}
					</span>
					<div className="order-hero-total">
						{formatPrice(order.total_minor, order.currency)}
					</div>
				</div>
			</div>

			<div className="order-info-grid">
				<div className="card info-card">
					<div className="info-card-label">Статус</div>
					<div className="info-card-value">{statusLabel(order.status)}</div>
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