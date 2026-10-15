import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import { api, clearToken, getToken, resolveMediaUrl, setToken } from './api';
import type {
	AdminProduct,
	AdminUser,
	Category,
	CategoryPayload,
	Order,
	OrderContact,
	OrderInvoice,
	ProductImage,
	ProductPayload,
	User,
} from './types';

const ORDER_STATUSES = [
	'new',
	'processing',
	'paid',
	'shipped',
	'completed',
	'cancelled',
] as const;

const NEW_ORDERS_POLL_INTERVAL_MS = 15000;

function formatPrice(minor: number, currency: string): string {
	return `${(minor / 100).toFixed(2)} ${currency}`;
}

function formatDate(value: string): string {
	return new Date(value).toLocaleString('ru-RU');
}

function roleLabel(role: string): string {
	if (role === 'admin') {
		return 'Администратор';
	}

	if (role === 'customer') {
		return 'Покупатель';
	}

	return role;
}

// Русская подпись статуса для отображения. ВАЖНО: value у <option> остаётся
// английским, потому что бэкенд валидирует статус по английскому белому списку.
function orderStatusLabel(status: string): string {
	switch (status) {
		case 'new':
			return 'Новый';
		case 'processing':
			return 'В обработке';
		case 'paid':
			return 'Оплачен';
		case 'shipped':
			return 'Отправлен';
		case 'completed':
			return 'Завершён';
		case 'cancelled':
			return 'Отменён';
		default:
			return status;
	}
}

function productToPayload(product: AdminProduct): ProductPayload {
	return {
		category_id: product.category_id,
		name: product.name,
		slug: product.slug,
		sku: product.sku,
		manufacturer: product.manufacturer ?? null,
		description: product.description ?? null,
		price_minor: product.price_minor,
		currency: product.currency,
		attributes: product.attributes,
		is_active: product.is_active,
		stock_quantity: product.stock_quantity,
	};
}

export default function App() {
	const [user, setUser] = useState<User | null>(null);
	const [checkingSession, setCheckingSession] = useState(true);

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

	if (checkingSession) {
		return <div className="center-screen">Загрузка...</div>;
	}

	if (!user) {
		return (
			<LoginPage
				onLogin={(loggedInUser) => {
					setUser(loggedInUser);
				}}
			/>
		);
	}

	if (user.role !== 'admin') {
		return (
			<div className="center-screen">
				<div className="card">
					<p>У этого пользователя нет прав администратора.</p>
					<button
						className="button"
						onClick={() => {
							clearToken();
							setUser(null);
						}}
					>
						Выйти
					</button>
				</div>
			</div>
		);
	}

	return (
		<AdminPanel
			user={user}
			onLogout={() => {
				clearToken();
				setUser(null);
			}}
		/>
	);
}

function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError('');
		setLoading(true);

		try {
			const response = await api.login(email, password);

			if (response.user.role !== 'admin') {
				setError('Этот пользователь не является администратором.');
				return;
			}

			setToken(response.token);
			onLogin(response.user);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось войти');
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="center-screen">
			<div className="login-card">
				<h2>Radio Store Admin</h2>
				<form className="login-form" onSubmit={handleSubmit}>
					<div className="field">
						<label htmlFor="email">Email</label>
						<input
							id="email"
							className="input"
							type="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							required
						/>
					</div>

					<div className="field">
						<label htmlFor="password">Пароль</label>
						<input
							id="password"
							className="input"
							type="password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							required
						/>
					</div>

					{error ? <div className="error">{error}</div> : null}

					<button className="button primary" disabled={loading}>
						{loading ? 'Вход...' : 'Войти'}
					</button>
				</form>
			</div>
		</div>
	);
}

type Tab = 'products' | 'categories' | 'orders' | 'users';

function AdminPanel({ user, onLogout }: { user: User; onLogout: () => void }) {
	const [tab, setTab] = useState<Tab>('products');
	const [newOrdersCount, setNewOrdersCount] = useState(0);

	const refreshNewOrdersCount = useCallback(async () => {
		try {
			const response = await api.getNewOrdersCount();
			setNewOrdersCount(response.count);
		} catch {
			// Ошибки фонового опроса намеренно игнорируем.
		}
	}, []);

	useEffect(() => {
		void refreshNewOrdersCount();

		const interval = window.setInterval(() => {
			void refreshNewOrdersCount();
		}, NEW_ORDERS_POLL_INTERVAL_MS);

		return () => {
			window.clearInterval(interval);
		};
	}, [refreshNewOrdersCount]);

	return (
		<div className="app-shell">
			<header className="topbar">
				<h1>Radio Store Admin</h1>
				<div>
					<span className="small">{user.email}</span>{' '}
					<button className="button" onClick={onLogout}>
						Выйти
					</button>
				</div>
			</header>

			<nav className="tabs">
				<button
					className={tab === 'products' ? 'tab active' : 'tab'}
					onClick={() => setTab('products')}
				>
					Товары
				</button>
				<button
					className={tab === 'categories' ? 'tab active' : 'tab'}
					onClick={() => setTab('categories')}
				>
					Категории
				</button>
				<button
					className={tab === 'orders' ? 'tab active' : 'tab'}
					onClick={() => setTab('orders')}
				>
					Заказы
					{newOrdersCount > 0 ? (
						<span className="tab-badge">
							{newOrdersCount > 99 ? '99+' : newOrdersCount}
						</span>
					) : null}
				</button>
				<button
					className={tab === 'users' ? 'tab active' : 'tab'}
					onClick={() => setTab('users')}
				>
					Пользователи
				</button>
			</nav>

			<main className="content">
				{tab === 'products' ? <ProductsTab /> : null}
				{tab === 'categories' ? <CategoriesTab /> : null}
				{tab === 'orders' ? (
					<OrdersTab onStatusChanged={refreshNewOrdersCount} />
				) : null}
				{tab === 'users' ? <UsersTab /> : null}
			</main>
		</div>
	);
}

function ProductsTab() {
	const [products, setProducts] = useState<AdminProduct[]>([]);
	const [categories, setCategories] = useState<Category[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [showForm, setShowForm] = useState(false);
	const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);
	const [imagesProductId, setImagesProductId] = useState<number | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError('');

		try {
			const [productsResponse, categoriesResponse] = await Promise.all([
				api.listAdminProducts(),
				api.listCategories(),
			]);

			setProducts(productsResponse);
			setCategories(categoriesResponse);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось загрузить товары');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function handleSave(payload: ProductPayload) {
		if (editingProduct) {
			await api.updateProduct(editingProduct.id, payload);
		} else {
			await api.createProduct(payload);
		}

		await load();
		setEditingProduct(null);
		setShowForm(false);
	}

	async function toggleActive(product: AdminProduct) {
		try {
			await api.updateProduct(product.id, {
				...productToPayload(product),
				is_active: !product.is_active,
			});
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось изменить товар');
		}
	}

	if (loading) {
		return <p>Загрузка товаров...</p>;
	}

	return (
		<section>
			<div className="card">
				<div className="actions" style={{ marginTop: 0 }}>
					<button
						className="button primary"
						onClick={() => {
							setEditingProduct(null);
							setShowForm(true);
						}}
					>
						Добавить товар
					</button>
					<button className="button" onClick={() => void load()}>
						Обновить
					</button>
				</div>

				{error ? <div className="error">{error}</div> : null}
			</div>

			{showForm ? (
				<div className="card">
					<h3>{editingProduct ? 'Редактирование товара' : 'Новый товар'}</h3>
					<ProductForm
						categories={categories}
						initial={editingProduct}
						onSave={handleSave}
						onCancel={() => {
							setShowForm(false);
							setEditingProduct(null);
						}}
					/>
				</div>
			) : null}

			{imagesProductId !== null ? (
				<ProductImagesPanel
					productId={imagesProductId}
					onClose={() => setImagesProductId(null)}
					onChanged={() => void load()}
				/>
			) : null}

			<div className="card">
				<table className="table">
					<thead>
						<tr>
							<th>Фото</th>
							<th>ID</th>
							<th>Название</th>
							<th>Категория</th>
							<th>SKU</th>
							<th>Цена</th>
							<th>Остаток</th>
							<th>Статус</th>
							<th>Действия</th>
						</tr>
					</thead>
					<tbody>
						{products.map((product) => (
							<tr key={product.id}>
								<td>
									{product.primary_image_url ? (
										<img
											className="table-thumb"
											src={resolveMediaUrl(product.primary_image_url)}
											alt={product.name}
										/>
									) : (
										<div className="table-thumb placeholder">нет</div>
									)}
								</td>
								<td>{product.id}</td>
								<td>
									<div>{product.name}</div>
									<div className="small muted">{product.slug}</div>
								</td>
								<td>{product.category_name}</td>
								<td>{product.sku}</td>
								<td>{formatPrice(product.price_minor, product.currency)}</td>
								<td>{product.stock_quantity}</td>
								<td>
									{product.is_active ? (
										<span className="badge green">Активен</span>
									) : (
										<span className="badge red">Выключен</span>
									)}
								</td>
								<td>
									<div className="actions" style={{ marginTop: 0 }}>
										<button
											className="button"
											onClick={() => {
												setEditingProduct(product);
												setShowForm(true);
											}}
										>
											Изменить
										</button>
										<button className="button" onClick={() => setImagesProductId(product.id)}>
											Фото
										</button>
										<button className="button" onClick={() => void toggleActive(product)}>
											{product.is_active ? 'Выключить' : 'Включить'}
										</button>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}

function ProductImagesPanel({
	productId,
	onClose,
	onChanged,
}: {
	productId: number;
	onClose: () => void;
	onChanged: () => void;
}) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [images, setImages] = useState<ProductImage[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [uploading, setUploading] = useState(false);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [alt, setAlt] = useState('');

	const load = useCallback(async () => {
		setLoading(true);
		setError('');

		try {
			const response = await api.listProductImages(productId);
			setImages(response);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось загрузить фотографии');
		} finally {
			setLoading(false);
		}
	}, [productId]);

	useEffect(() => {
		void load();
	}, [load]);

	async function handleUpload() {
		if (!selectedFile) {
			setError('Выберите файл изображения');
			return;
		}

		setUploading(true);
		setError('');

		try {
			await api.uploadProductImage(productId, selectedFile, alt);
			setSelectedFile(null);
			setAlt('');

			if (fileInputRef.current) {
				fileInputRef.current.value = '';
			}

			await load();
			onChanged();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось загрузить изображение');
		} finally {
			setUploading(false);
		}
	}

	async function handleDelete(imageId: number) {
		if (!confirm('Удалить это изображение?')) {
			return;
		}

		setError('');

		try {
			await api.deleteProductImage(productId, imageId);
			await load();
			onChanged();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось удалить изображение');
		}
	}

	async function handleSetPrimary(imageId: number) {
		setError('');

		try {
			await api.setPrimaryProductImage(productId, imageId);
			await load();
			onChanged();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось сделать фото главным');
		}
	}

	return (
		<div className="card">
			<div className="panel-head">
				<h3>Фотографии товара #{productId}</h3>
				<button className="button" onClick={onClose}>
					Закрыть
				</button>
			</div>

			<div className="upload-row">
				<input
					ref={fileInputRef}
					type="file"
					accept="image/jpeg,image/png,image/webp,image/gif"
					onChange={(event) => {
						const file = event.target.files?.[0] ?? null;
						setSelectedFile(file);
					}}
				/>
				<input
					className="input"
					placeholder="Alt-текст (необязательно)"
					value={alt}
					onChange={(event) => setAlt(event.target.value)}
				/>
				<button
					className="button primary"
					disabled={uploading || !selectedFile}
					onClick={() => void handleUpload()}
				>
					{uploading ? 'Загрузка...' : 'Загрузить'}
				</button>
			</div>

			{error ? <div className="error">{error}</div> : null}

			{loading ? (
				<p>Загрузка фотографий...</p>
			) : images.length === 0 ? (
				<p className="muted">Фотографий пока нет.</p>
			) : (
				<div className="image-grid">
					{images.map((image) => (
						<div key={image.id} className="image-tile">
							<img
								className="image-thumb"
								src={resolveMediaUrl(image.url)}
								alt={image.alt ?? ''}
							/>

							{image.is_primary ? <span className="image-badge-primary">Главное</span> : null}

							<div className="image-actions">
								{!image.is_primary ? (
									<button
										className="button"
										onClick={() => void handleSetPrimary(image.id)}
									>
										Сделать главным
									</button>
								) : null}
								<button
									className="button danger"
									onClick={() => void handleDelete(image.id)}
								>
									Удалить
								</button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function ProductForm({
	categories,
	initial,
	onSave,
	onCancel,
}: {
	categories: Category[];
	initial: AdminProduct | null;
	onSave: (payload: ProductPayload) => Promise<void>;
	onCancel: () => void;
}) {
	const [categoryID, setCategoryID] = useState(
		initial
			? String(initial.category_id)
			: categories.length > 0
				? String(categories[0].id)
				: '',
	);
	const [name, setName] = useState(initial?.name ?? '');
	const [slug, setSlug] = useState(initial?.slug ?? '');
	const [sku, setSku] = useState(initial?.sku ?? '');
	const [manufacturer, setManufacturer] = useState(initial?.manufacturer ?? '');
	const [price, setPrice] = useState(initial ? String(initial.price_minor / 100) : '');
	const [currency, setCurrency] = useState(initial?.currency ?? 'RUB');
	const [description, setDescription] = useState(initial?.description ?? '');
	const [attributesText, setAttributesText] = useState(
		initial?.attributes ? JSON.stringify(initial.attributes, null, 2) : '{}',
	);
	const [stock, setStock] = useState(String(initial?.stock_quantity ?? 0));
	const [isActive, setIsActive] = useState(initial?.is_active ?? true);
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError('');

		const selectedCategoryID = Number(categoryID);
		if (!categoryID || Number.isNaN(selectedCategoryID) || selectedCategoryID <= 0) {
			setError('Выберите категорию');
			return;
		}

		let attributes: Record<string, unknown>;

		try {
			const parsed = JSON.parse(attributesText || '{}') as unknown;

			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
				setError('Характеристики должны быть JSON-объектом, например: {"корпус": "0805"}');
				return;
			}

			attributes = parsed as Record<string, unknown>;
		} catch {
			setError('Характеристики должны быть корректным JSON');
			return;
		}

		const priceNumber = Number(price.replace(',', '.'));
		if (Number.isNaN(priceNumber) || priceNumber < 0) {
			setError('Цена должна быть неотрицательным числом');
			return;
		}

		const stockNumber = Number(stock || '0');
		if (!Number.isInteger(stockNumber) || stockNumber < 0) {
			setError('Остаток должен быть целым неотрицательным числом');
			return;
		}

		const payload: ProductPayload = {
			category_id: selectedCategoryID,
			name: name.trim(),
			slug: slug.trim(),
			sku: sku.trim(),
			manufacturer: manufacturer.trim() || null,
			description: description.trim() || null,
			price_minor: Math.round(priceNumber * 100),
			currency: currency.trim().toUpperCase() || 'RUB',
			attributes,
			is_active: isActive,
			stock_quantity: stockNumber,
		};

		try {
			setSaving(true);
			await onSave(payload);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось сохранить товар');
		} finally {
			setSaving(false);
		}
	}

	return (
		<form onSubmit={handleSubmit}>
			<div className="form-grid">
				<div className="field">
					<label>Категория</label>
					<select
						className="select"
						value={categoryID}
						onChange={(event) => setCategoryID(event.target.value)}
					>
						{categories.map((category) => (
							<option key={category.id} value={category.id}>
								{category.name}
							</option>
						))}
					</select>
				</div>

				<div className="field">
					<label>Название</label>
					<input
						className="input"
						value={name}
						onChange={(event) => setName(event.target.value)}
						required
					/>
				</div>

				<div className="field">
					<label>Slug</label>
					<input
						className="input"
						value={slug}
						onChange={(event) => setSlug(event.target.value)}
						required
					/>
				</div>

				<div className="field">
					<label>SKU / артикул</label>
					<input
						className="input"
						value={sku}
						onChange={(event) => setSku(event.target.value)}
						required
					/>
				</div>

				<div className="field">
					<label>Производитель</label>
					<input
						className="input"
						value={manufacturer}
						onChange={(event) => setManufacturer(event.target.value)}
					/>
				</div>

				<div className="field">
					<label>Цена, например 150.00</label>
					<input
						className="input"
						value={price}
						onChange={(event) => setPrice(event.target.value)}
						required
					/>
				</div>

				<div className="field">
					<label>Валюта</label>
					<input
						className="input"
						value={currency}
						onChange={(event) => setCurrency(event.target.value)}
						required
					/>
				</div>

				<div className="field">
					<label>Остаток</label>
					<input
						className="input"
						value={stock}
						onChange={(event) => setStock(event.target.value)}
					/>
				</div>
			</div>

			<div className="field" style={{ marginTop: 12 }}>
				<label>Описание</label>
				<textarea
					className="textarea"
					value={description}
					onChange={(event) => setDescription(event.target.value)}
				/>
			</div>

			<div className="field" style={{ marginTop: 12 }}>
				<label>Характеристики, JSON</label>
				<textarea
					className="textarea"
					value={attributesText}
					onChange={(event) => setAttributesText(event.target.value)}
				/>
			</div>

			<div className="checkbox-row" style={{ marginTop: 12 }}>
				<input
					id="product-active"
					type="checkbox"
					checked={isActive}
					onChange={(event) => setIsActive(event.target.checked)}
				/>
				<label htmlFor="product-active">Товар активен</label>
			</div>

			{initial ? (
				<p className="small muted" style={{ marginTop: 12 }}>
					Фотографии добавляются после сохранения товара — кнопка «Фото» в таблице.
				</p>
			) : null}

			{error ? <div className="error">{error}</div> : null}

			<div className="actions">
				<button className="button primary" disabled={saving}>
					{saving ? 'Сохранение...' : 'Сохранить'}
				</button>
				<button className="button" type="button" onClick={onCancel}>
					Отмена
				</button>
			</div>
		</form>
	);
}

function CategoriesTab() {
	const [categories, setCategories] = useState<Category[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [showForm, setShowForm] = useState(false);
	const [editingCategory, setEditingCategory] = useState<Category | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError('');

		try {
			const response = await api.listCategories();
			setCategories(response);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось загрузить категории');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function handleSave(payload: CategoryPayload) {
		if (editingCategory) {
			await api.updateCategory(editingCategory.id, payload);
		} else {
			await api.createCategory(payload);
		}

		await load();
		setEditingCategory(null);
		setShowForm(false);
	}

	async function handleDelete(category: Category) {
		if (!confirm(`Удалить категорию "${category.name}"?`)) {
			return;
		}

		try {
			await api.deleteCategory(category.id);
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось удалить категорию');
		}
	}

	if (loading) {
		return <p>Загрузка категорий...</p>;
	}

	return (
		<section>
			<div className="card">
				<div className="actions" style={{ marginTop: 0 }}>
					<button
						className="button primary"
						onClick={() => {
							setEditingCategory(null);
							setShowForm(true);
						}}
					>
						Добавить категорию
					</button>
					<button className="button" onClick={() => void load()}>
						Обновить
					</button>
				</div>

				{error ? <div className="error">{error}</div> : null}
			</div>

			{showForm ? (
				<div className="card">
					<h3>{editingCategory ? 'Редактирование категории' : 'Новая категория'}</h3>
					<CategoryForm
						categories={categories}
						initial={editingCategory}
						onSave={handleSave}
						onCancel={() => {
							setShowForm(false);
							setEditingCategory(null);
						}}
					/>
				</div>
			) : null}

			<div className="card">
				<table className="table">
					<thead>
						<tr>
							<th>ID</th>
							<th>Название</th>
							<th>Slug</th>
							<th>Родительская категория</th>
							<th>Действия</th>
						</tr>
					</thead>
					<tbody>
						{categories.map((category) => {
							const parent = category.parent_id
								? categories.find((item) => item.id === category.parent_id)
								: undefined;

							return (
								<tr key={category.id}>
									<td>{category.id}</td>
									<td>{category.name}</td>
									<td>{category.slug}</td>
									<td>{parent ? parent.name : '—'}</td>
									<td>
										<div className="actions" style={{ marginTop: 0 }}>
											<button
												className="button"
												onClick={() => {
													setEditingCategory(category);
													setShowForm(true);
												}}
											>
												Изменить
											</button>
											<button
												className="button danger"
												onClick={() => void handleDelete(category)}
											>
												Удалить
											</button>
										</div>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</section>
	);
}

function CategoryForm({
	categories,
	initial,
	onSave,
	onCancel,
}: {
	categories: Category[];
	initial: Category | null;
	onSave: (payload: CategoryPayload) => Promise<void>;
	onCancel: () => void;
}) {
	const [name, setName] = useState(initial?.name ?? '');
	const [slug, setSlug] = useState(initial?.slug ?? '');
	const [parentID, setParentID] = useState(
		initial?.parent_id ? String(initial.parent_id) : '',
	);
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);

	const availableParents = categories.filter((category) => category.id !== initial?.id);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError('');

		const payload: CategoryPayload = {
			name: name.trim(),
			slug: slug.trim(),
			parent_id: parentID ? Number(parentID) : null,
		};

		try {
			setSaving(true);
			await onSave(payload);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось сохранить категорию');
		} finally {
			setSaving(false);
		}
	}

	return (
		<form onSubmit={handleSubmit}>
			<div className="form-grid">
				<div className="field">
					<label>Название</label>
					<input
						className="input"
						value={name}
						onChange={(event) => setName(event.target.value)}
						required
					/>
				</div>

				<div className="field">
					<label>Slug</label>
					<input
						className="input"
						value={slug}
						onChange={(event) => setSlug(event.target.value)}
						required
					/>
				</div>

				<div className="field">
					<label>Родительская категория</label>
					<select
						className="select"
						value={parentID}
						onChange={(event) => setParentID(event.target.value)}
					>
						<option value="">Без родителя</option>
						{availableParents.map((category) => (
							<option key={category.id} value={category.id}>
								{category.name}
							</option>
						))}
					</select>
				</div>
			</div>

			{error ? <div className="error">{error}</div> : null}

			<div className="actions">
				<button className="button primary" disabled={saving}>
					{saving ? 'Сохранение...' : 'Сохранить'}
				</button>
				<button className="button" type="button" onClick={onCancel}>
					Отмена
				</button>
			</div>
		</form>
	);
}

function OrdersTab({ onStatusChanged }: { onStatusChanged?: () => void }) {
	const [orders, setOrders] = useState<Order[]>([]);
	const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [contacts, setContacts] = useState<Record<number, OrderContact>>({});
	const [invoices, setInvoices] = useState<Record<number, OrderInvoice[]>>({});
	const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
	const [busyInvoiceId, setBusyInvoiceId] = useState<number | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError('');

		try {
			const response = await api.listOrders();
			setOrders(response);

			const orderIds = response.map((order) => order.id);

			const [contactsResponse, invoicesResponse] = await Promise.all([
				api.getOrderContacts(orderIds).catch(() => [] as OrderContact[]),
				api.listInvoicesByOrders(orderIds).catch(() => [] as OrderInvoice[]),
			]);

			const contactsMap: Record<number, OrderContact> = {};
			for (const item of contactsResponse) {
				contactsMap[item.order_id] = item;
			}
			setContacts(contactsMap);

			const invoicesMap: Record<number, OrderInvoice[]> = {};
			for (const invoice of invoicesResponse) {
				if (!invoicesMap[invoice.order_id]) {
					invoicesMap[invoice.order_id] = [];
				}
				invoicesMap[invoice.order_id].push(invoice);
			}
			setInvoices(invoicesMap);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось загрузить заказы');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function openOrder(order: Order) {
		try {
			const fullOrder = await api.getOrder(order.id);
			setSelectedOrder(fullOrder);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось загрузить заказ');
		}
	}

	async function changeStatus(order: Order, status: string) {
		try {
			await api.updateOrderStatus(order.id, status);
			await load();

			onStatusChanged?.();

			setSelectedOrder((previous) =>
				previous && previous.id === order.id ? { ...previous, status } : previous,
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось изменить статус заказа');
		}
	}

	async function createInvoice(order: Order) {
		setBusyOrderId(order.id);
		setError('');

		try {
			const invoice = await api.createOrderInvoice(order.id);
			setInvoices((previous) => ({
				...previous,
				[order.id]: [...(previous[order.id] ?? []), invoice],
			}));
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось создать счёт');
		} finally {
			setBusyOrderId(null);
		}
	}

	async function sendInvoice(invoice: OrderInvoice) {
		setBusyInvoiceId(invoice.id);
		setError('');

		try {
			const updated = await api.sendInvoice(invoice.id);
			setInvoices((previous) => ({
				...previous,
				[invoice.order_id]: (previous[invoice.order_id] ?? []).map((item) =>
					item.id === updated.id ? updated : item,
				),
			}));
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось отправить счёт');
		} finally {
			setBusyInvoiceId(null);
		}
	}

	async function viewInvoice(invoiceId: number) {
		setError('');

		try {
			const html = await api.getInvoiceHtml(invoiceId);
			const win = window.open('', '_blank');

			if (!win) {
				setError('Браузер заблокировал новое окно. Разреши всплывающие окна для админки.');
				return;
			}

			win.document.open();
			win.document.write(html);
			win.document.close();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось открыть счёт');
		}
	}

	if (loading) {
		return <p>Загрузка заказов...</p>;
	}

	return (
		<section>
			<div className="card">
				<div className="actions" style={{ marginTop: 0 }}>
					<button className="button" onClick={() => void load()}>
						Обновить
					</button>
				</div>

				{error ? <div className="error">{error}</div> : null}
			</div>

			<div className="card">
				<table className="table">
					<thead>
						<tr>
							<th>ID</th>
							<th>Создан</th>
							<th>Сумма</th>
							<th>Статус</th>
							<th>Адрес</th>
							<th>Контакты</th>
							<th>Счёт</th>
							<th>Действия</th>
						</tr>
					</thead>
					<tbody>
						{orders.map((order) => {
							const contact = contacts[order.id];
							const orderInvoices = invoices[order.id] ?? [];
							const isProcessing = order.status === 'processing';

							return (
								<tr key={order.id}>
									<td>{order.id}</td>
									<td>{formatDate(order.created_at)}</td>
									<td>{formatPrice(order.total_minor, order.currency)}</td>
									<td>
										<select
											className="select"
											style={{ minWidth: 150 }}
											value={order.status}
											onChange={(event) => void changeStatus(order, event.target.value)}
										>
											{ORDER_STATUSES.map((status) => (
												<option key={status} value={status}>
													{orderStatusLabel(status)}
												</option>
											))}
										</select>
									</td>
									<td>{order.shipping_address ?? '—'}</td>
									<td>
										<div className="contact-cell">
											<div>{contact?.customer_email || order.customer_email || '—'}</div>
											<div className="muted small">
												{contact?.customer_phone || order.customer_phone || '—'}
											</div>
										</div>
									</td>
									<td>
										{orderInvoices.length === 0 ? (
											isProcessing ? (
												<button
													className="button small"
													disabled={busyOrderId === order.id}
													onClick={() => void createInvoice(order)}
												>
													{busyOrderId === order.id ? 'Создание...' : 'Создать счёт'}
												</button>
											) : (
												<span className="muted small">—</span>
											)
										) : (
											<div className="invoice-list">
												{orderInvoices.map((invoice) => (
													<div key={invoice.id} className="invoice-row">
														<span className="invoice-number">
															{invoice.number}
															{' '}
															<span
																className={
																	invoice.status === 'sent'
																		? 'badge green'
																		: 'badge'
																}
															>
																{invoice.status === 'sent' ? 'отправлен' : 'черновик'}
															</span>
														</span>
														<div className="actions" style={{ marginTop: 0 }}>
															<button
																className="button small"
																onClick={() => void viewInvoice(invoice.id)}
															>
																Просмотр
															</button>
															{invoice.status === 'draft' ? (
																<button
																	className="button small primary"
																	disabled={busyInvoiceId === invoice.id}
																	onClick={() => void sendInvoice(invoice)}
																>
																	{busyInvoiceId === invoice.id
																		? 'Отправка...'
																		: 'Отправить счёт'}
																</button>
															) : null}
														</div>
													</div>
												))}
											</div>
										)}
									</td>
									<td>
										<button className="button" onClick={() => void openOrder(order)}>
											Открыть
										</button>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			{selectedOrder ? (
				<div className="card order-details">
					<h3>Заказ №{selectedOrder.id}</h3>
					<p>
						<span className="badge">{orderStatusLabel(selectedOrder.status)}</span>{' '}
						<span className="muted">
							сумма: {formatPrice(selectedOrder.total_minor, selectedOrder.currency)}
						</span>
					</p>

					{selectedOrder.shipping_address ? (
						<p>
							<strong>Адрес:</strong> {selectedOrder.shipping_address}
						</p>
					) : null}

					{(contacts[selectedOrder.id]?.customer_email || selectedOrder.customer_email) ? (
						<p>
							<strong>Email:</strong>{' '}
							{contacts[selectedOrder.id]?.customer_email || selectedOrder.customer_email}
						</p>
					) : null}

					{(contacts[selectedOrder.id]?.customer_phone || selectedOrder.customer_phone) ? (
						<p>
							<strong>Телефон:</strong>{' '}
							{contacts[selectedOrder.id]?.customer_phone || selectedOrder.customer_phone}
						</p>
					) : null}

					{selectedOrder.comment ? (
						<p>
							<strong>Комментарий:</strong> {selectedOrder.comment}
						</p>
					) : null}

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
							{(selectedOrder.items ?? []).map((item) => (
								<tr key={item.id}>
									<td>{item.name}</td>
									<td>{item.sku}</td>
									<td>{item.quantity}</td>
									<td>{formatPrice(item.price_minor, selectedOrder.currency)}</td>
									<td>
										{formatPrice(item.price_minor * item.quantity, selectedOrder.currency)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : null}
		</section>
	);
}

function UsersTab() {
	const [users, setUsers] = useState<AdminUser[]>([]);
	const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
	const [loading, setLoading] = useState(true);
	const [detailLoading, setDetailLoading] = useState(false);
	const [error, setError] = useState('');
	const [detailError, setDetailError] = useState('');
	const [searchInput, setSearchInput] = useState('');
	const [search, setSearch] = useState('');

	useEffect(() => {
		const timer = setTimeout(() => {
			setSearch(searchInput.trim());
		}, 300);

		return () => {
			clearTimeout(timer);
		};
	}, [searchInput]);

	const load = useCallback(async () => {
		setLoading(true);
		setError('');

		try {
			const response = await api.listUsers({
				limit: 100,
				search: search || undefined,
			});

			setUsers(response);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось загрузить пользователей');
		} finally {
			setLoading(false);
		}
	}, [search]);

	useEffect(() => {
		void load();
	}, [load]);

	async function openUser(userID: number) {
		setDetailLoading(true);
		setDetailError('');

		try {
			const response = await api.getUser(userID);
			setSelectedUser(response);
		} catch (err) {
			setDetailError(err instanceof Error ? err.message : 'Не удалось загрузить пользователя');
		} finally {
			setDetailLoading(false);
		}
	}

	if (loading) {
		return <p>Загрузка пользователей...</p>;
	}

	return (
		<section>
			<div className="card">
				<div className="toolbar" style={{ marginBottom: 0 }}>
					<input
						className="input search-input"
						placeholder="Поиск по email или имени"
						value={searchInput}
						onChange={(event) => setSearchInput(event.target.value)}
					/>
					<button className="button" onClick={() => void load()}>
						Обновить
					</button>
				</div>

				{error ? <div className="error">{error}</div> : null}
			</div>

			<div className="card">
				<table className="table">
					<thead>
						<tr>
							<th>ID</th>
							<th>Email</th>
							<th>Имя</th>
							<th>Роль</th>
							<th>Зарегистрирован</th>
							<th>Действия</th>
						</tr>
					</thead>
					<tbody>
						{users.map((user) => (
							<tr key={user.id}>
								<td>{user.id}</td>
								<td>{user.email}</td>
								<td>{user.full_name ?? '—'}</td>
								<td>{roleLabel(user.role)}</td>
								<td>{formatDate(user.created_at)}</td>
								<td>
									<button className="button" onClick={() => void openUser(user.id)}>
										Открыть
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{detailLoading ? <p>Загрузка пользователя...</p> : null}

			{detailError ? <div className="error">{detailError}</div> : null}

			{selectedUser && !detailLoading ? (
				<div className="card order-details">
					<h3>Пользователь #{selectedUser.id}</h3>

					<p>
						<strong>Email:</strong> {selectedUser.email}
					</p>

					<p>
						<strong>Имя:</strong> {selectedUser.full_name ?? '—'}
					</p>

					<p>
						<strong>Роль:</strong> {roleLabel(selectedUser.role)}
					</p>

					<p>
						<strong>Зарегистрирован:</strong> {formatDate(selectedUser.created_at)}
					</p>

					<p>
						<strong>Обновлён:</strong> {formatDate(selectedUser.updated_at)}
					</p>
				</div>
			) : null}
		</section>
	);
}