import type {
	AdminProduct,
	AdminUser,
	AuthResponse,
	BlogPost,
	BlogPostPayload,
	Category,
	CategoryPayload,
	Order,
	OrderContact,
	OrderInvoice,
	ProductImage,
	ProductPayload,
	User,
} from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

const TOKEN_KEY = 'radio_store_admin_token';

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

export function getApiUrl(): string {
	return API_URL;
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
		if (response.status === 401) {
			clearToken();
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

async function uploadRequest<T>(path: string, formData: FormData): Promise<T> {
	const headers = new Headers();

	if (token) {
		headers.set('Authorization', `Bearer ${token}`);
	}

	const response = await fetch(`${API_URL}${path}`, {
		method: 'POST',
		headers,
		body: formData,
	});

	if (!response.ok) {
		if (response.status === 401) {
			clearToken();
		}

		let message = `Upload failed with status ${response.status}`;

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

	return (await response.json()) as T;
}

async function textRequest(path: string): Promise<string> {
	const headers = new Headers();

	if (token) {
		headers.set('Authorization', `Bearer ${token}`);
	}

	const response = await fetch(`${API_URL}${path}`, { headers });

	if (!response.ok) {
		if (response.status === 401) {
			clearToken();
		}

		let message = `Request failed with status ${response.status}`;

		try {
			const body = (await response.json()) as { error?: string };
			if (body.error) {
				message = body.error;
			}
		} catch {
			// ignore
		}

		throw new Error(message);
	}

	return response.text();
}

export const api = {
	login(email: string, password: string): Promise<AuthResponse> {
		return request<AuthResponse>('/api/v1/auth/login', {
			method: 'POST',
			body: JSON.stringify({ email, password }),
		});
	},

	me(): Promise<User> {
		return request<User>('/api/v1/auth/me');
	},

	listAdminProducts(): Promise<AdminProduct[]> {
		return request<AdminProduct[]>('/api/v1/admin/products');
	},

	createProduct(payload: ProductPayload): Promise<AdminProduct> {
		return request<AdminProduct>('/api/v1/admin/products', {
			method: 'POST',
			body: JSON.stringify(payload),
		});
	},

	updateProduct(id: number, payload: ProductPayload): Promise<AdminProduct> {
		return request<AdminProduct>(`/api/v1/admin/products/${id}`, {
			method: 'PATCH',
			body: JSON.stringify(payload),
		});
	},

	setStock(id: number, quantity: number): Promise<AdminProduct> {
		return request<AdminProduct>(`/api/v1/admin/products/${id}/stock`, {
			method: 'PATCH',
			body: JSON.stringify({ quantity }),
		});
	},

	listProductImages(productId: number): Promise<ProductImage[]> {
		return request<ProductImage[]>(`/api/v1/admin/products/${productId}/images`);
	},

	uploadProductImage(productId: number, file: File, alt?: string): Promise<ProductImage> {
		const formData = new FormData();
		formData.append('file', file);

		if (alt && alt.trim()) {
			formData.append('alt', alt.trim());
		}

		return uploadRequest<ProductImage>(`/api/v1/admin/products/${productId}/images`, formData);
	},

	deleteProductImage(productId: number, imageId: number): Promise<{ message: string }> {
		return request<{ message: string }>(
			`/api/v1/admin/products/${productId}/images/${imageId}`,
			{ method: 'DELETE' },
		);
	},

	setPrimaryProductImage(productId: number, imageId: number): Promise<ProductImage> {
		return request<ProductImage>(
			`/api/v1/admin/products/${productId}/images/${imageId}/primary`,
			{ method: 'PATCH' },
		);
	},

	listCategories(): Promise<Category[]> {
		return request<Category[]>('/api/v1/admin/categories');
	},

	createCategory(payload: CategoryPayload): Promise<Category> {
		return request<Category>('/api/v1/admin/categories', {
			method: 'POST',
			body: JSON.stringify(payload),
		});
	},

	updateCategory(id: number, payload: CategoryPayload): Promise<Category> {
		return request<Category>(`/api/v1/admin/categories/${id}`, {
			method: 'PATCH',
			body: JSON.stringify(payload),
		});
	},

	deleteCategory(id: number): Promise<{ message: string }> {
		return request<{ message: string }>(`/api/v1/admin/categories/${id}`, {
			method: 'DELETE',
		});
	},

	listOrders(): Promise<Order[]> {
		return request<Order[]>('/api/v1/admin/orders');
	},

	getNewOrdersCount(): Promise<{ count: number }> {
		return request<{ count: number }>('/api/v1/admin/orders/new-count');
	},

	getOrderContacts(orderIds: number[]): Promise<OrderContact[]> {
		const unique = Array.from(new Set(orderIds.filter((id) => id > 0)));

		if (unique.length === 0) {
			return Promise.resolve([]);
		}

		const query = new URLSearchParams();
		query.set('ids', unique.join(','));

		return request<OrderContact[]>(`/api/v1/admin/orders/contacts?${query.toString()}`);
	},

	getOrder(id: number): Promise<Order> {
		return request<Order>(`/api/v1/orders/${id}`);
	},

	updateOrderStatus(id: number, status: string): Promise<Order> {
		return request<Order>(`/api/v1/admin/orders/${id}/status`, {
			method: 'PATCH',
			body: JSON.stringify({ status }),
		});
	},

	listInvoicesByOrders(orderIds: number[]): Promise<OrderInvoice[]> {
		const unique = Array.from(new Set(orderIds.filter((id) => id > 0)));

		if (unique.length === 0) {
			return Promise.resolve([]);
		}

		const query = new URLSearchParams();
		query.set('order_ids', unique.join(','));

		return request<OrderInvoice[]>(`/api/v1/admin/invoices?${query.toString()}`);
	},

	createOrderInvoice(orderId: number): Promise<OrderInvoice> {
		return request<OrderInvoice>(`/api/v1/admin/orders/${orderId}/invoices`, {
			method: 'POST',
		});
	},

	sendInvoice(invoiceId: number): Promise<OrderInvoice> {
		return request<OrderInvoice>(`/api/v1/admin/invoices/${invoiceId}/send`, {
			method: 'POST',
		});
	},

	getInvoiceHtml(invoiceId: number): Promise<string> {
		return textRequest(`/api/v1/admin/invoices/${invoiceId}/view`);
	},

	listBlogPosts(): Promise<BlogPost[]> {
		return request<BlogPost[]>('/api/v1/admin/blog/posts');
	},

	createBlogPost(payload: BlogPostPayload): Promise<BlogPost> {
		return request<BlogPost>('/api/v1/admin/blog/posts', {
			method: 'POST',
			body: JSON.stringify(payload),
		});
	},

	updateBlogPost(id: number, payload: BlogPostPayload): Promise<BlogPost> {
		return request<BlogPost>(`/api/v1/admin/blog/posts/${id}`, {
			method: 'PATCH',
			body: JSON.stringify(payload),
		});
	},

	deleteBlogPost(id: number): Promise<{ message: string }> {
		return request<{ message: string }>(`/api/v1/admin/blog/posts/${id}`, {
			method: 'DELETE',
		});
	},

	uploadBlogCover(postId: number, file: File): Promise<BlogPost> {
		const formData = new FormData();
		formData.append('file', file);

		return uploadRequest<BlogPost>(`/api/v1/admin/blog/posts/${postId}/cover`, formData);
	},

	listUsers(params: {
		limit?: number;
		offset?: number;
		search?: string;
	} = {}): Promise<AdminUser[]> {
		const query = new URLSearchParams();

		query.set('limit', String(params.limit ?? 100));

		if (params.offset !== undefined) {
			query.set('offset', String(params.offset));
		}

		if (params.search) {
			query.set('search', params.search);
		}

		return request<AdminUser[]>(`/api/v1/admin/users?${query.toString()}`);
	},

	getUser(id: number): Promise<AdminUser> {
		return request<AdminUser>(`/api/v1/admin/users/${id}`);
	},
};