import type {
	AuthResponse,
	Cart,
	Category,
	CreateOrderResponse,
	Order,
	Product,
	User,
} from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

const TOKEN_KEY = 'radio_store_customer_token';

let token = localStorage.getItem(TOKEN_KEY) ?? '';

export function setToken(value: string): void {
	token = value;
	localStorage.setItem(TOKEN_KEY, value);
}

export function clearToken(): void {
	token = '';
	localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string {
	return token;
}

export function resolveMediaUrl(path: string | null | undefined): string {
	if (!path) {
		return '';
	}

	if (path.startsWith('http://') || path.startsWith('https://')) {
		return path;
	}

	return `${API_URL}${path}`;
}

function emitUnauthorized(): void {
	clearToken();
	window.dispatchEvent(new Event('auth:logout'));
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	const headers = new Headers(options.headers);
	headers.set('Content-Type', 'application/json');

	if (token) {
		headers.set('Authorization', `Bearer ${token}`);
	}

	const response = await fetch(`${API_URL}${path}`, {
		...options,
		headers,
	});

	if (!response.ok) {
		if (response.status === 401 && token) {
			emitUnauthorized();
		}

		let message = `Request failed with status ${response.status}`;

		try {
			const body = (await response.json()) as { error?: string };
			if (body.error) {
				message = body.error;
			}
		} catch {
			// ignore json parse error
		}

		throw new Error(message);
	}

	if (response.status === 204) {
		return undefined as T;
	}

	return (await response.json()) as T;
}

export const api = {
	register(email: string, password: string, fullName: string): Promise<AuthResponse> {
		return request<AuthResponse>('/api/v1/auth/register', {
			method: 'POST',
			body: JSON.stringify({
				email,
				password,
				full_name: fullName,
			}),
		});
	},

	login(email: string, password: string): Promise<AuthResponse> {
		return request<AuthResponse>('/api/v1/auth/login', {
			method: 'POST',
			body: JSON.stringify({ email, password }),
		});
	},

	me(): Promise<User> {
		return request<User>('/api/v1/auth/me');
	},

	listCategories(): Promise<Category[]> {
		return request<Category[]>('/api/v1/categories');
	},

	listProducts(filters: {
		category_id?: number;
		search?: string;
		limit?: number;
		offset?: number;
	} = {}): Promise<Product[]> {
		const params = new URLSearchParams();

		if (filters.category_id !== undefined) {
			params.set('category_id', String(filters.category_id));
		}

		if (filters.search) {
			params.set('search', filters.search);
		}

		params.set('limit', String(filters.limit ?? 48));

		if (filters.offset !== undefined) {
			params.set('offset', String(filters.offset));
		}

		const query = params.toString();
		return request<Product[]>(`/api/v1/products${query ? `?${query}` : ''}`);
	},

	getProduct(id: number): Promise<Product> {
		return request<Product>(`/api/v1/products/${id}`);
	},

	getCart(): Promise<Cart> {
		return request<Cart>('/api/v1/cart');
	},

	addCartItem(productID: number, quantity: number): Promise<{ product_id: number; quantity: number }> {
		return request<{ product_id: number; quantity: number }>('/api/v1/cart/items', {
			method: 'POST',
			body: JSON.stringify({
				product_id: productID,
				quantity,
			}),
		});
	},

	updateCartItem(
		productID: number,
		quantity: number,
	): Promise<{ product_id: number; quantity: number }> {
		return request<{ product_id: number; quantity: number }>(
			`/api/v1/cart/items/${productID}`,
			{
				method: 'PATCH',
				body: JSON.stringify({ quantity }),
			},
		);
	},

	deleteCartItem(productID: number): Promise<{ message: string }> {
		return request<{ message: string }>(`/api/v1/cart/items/${productID}`, {
			method: 'DELETE',
		});
	},

	createOrder(shippingAddress: string, comment: string): Promise<CreateOrderResponse> {
		return request<CreateOrderResponse>('/api/v1/orders', {
			method: 'POST',
			body: JSON.stringify({
				shipping_address: shippingAddress,
				comment,
			}),
		});
	},

	listOrders(): Promise<Order[]> {
		return request<Order[]>('/api/v1/orders');
	},

	getOrder(id: number): Promise<Order> {
		return request<Order>(`/api/v1/orders/${id}`);
	},
};