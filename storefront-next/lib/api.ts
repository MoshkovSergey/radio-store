import type {
  AuthResponse,
  Cart,
  Category,
  CreateOrderResponse,
  Order,
  Product,
  ProductPrimaryImage,
  ProductWithCategory,
  User,
} from './types';

const CLIENT_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

function getServerApiUrl(): string {
  return process.env.INTERNAL_API_URL ?? CLIENT_API_URL;
}

export function resolveMediaUrl(path: string | null | undefined): string {
  if (!path) {
    return '';
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  return `${CLIENT_API_URL}${path}`;
}

export function resolveServerMediaUrl(path: string | null | undefined): string {
  if (!path) {
    return '';
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  return `${getServerApiUrl()}${path}`;
}

async function serverFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T | null> {
  try {
    const response = await fetch(`${getServerApiUrl()}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function getCategories(): Promise<Category[]> {
  const data = await serverFetch<Category[]>('/api/v1/categories', {
    next: { revalidate: 300 },
  });

  return data ?? [];
}

export async function getCategoryBySlug(
  slug: string,
): Promise<Category | null> {
  const categories = await getCategories();
  return categories.find((category) => category.slug === slug) ?? null;
}

export async function getProducts(params: {
  category_id?: number;
  search?: string;
  limit?: number;
  offset?: number;
  revalidate?: number;
}): Promise<Product[]> {
  const query = new URLSearchParams();

  if (params.category_id !== undefined) {
    query.set('category_id', String(params.category_id));
  }

  if (params.search) {
    query.set('search', params.search);
  }

  query.set('limit', String(params.limit ?? 24));

  if (params.offset !== undefined) {
    query.set('offset', String(params.offset));
  }

  const data = await serverFetch<Product[]>(
    `/api/v1/products?${query.toString()}`,
    {
      next: { revalidate: params.revalidate ?? 60 },
    },
  );

  return data ?? [];
}

export async function getAllProductsForSitemap(): Promise<Product[]> {
  const data = await serverFetch<Product[]>('/api/v1/products?limit=100', {
    next: { revalidate: 300 },
  });

  return data ?? [];
}

export async function getProductById(id: number): Promise<Product | null> {
  return serverFetch<Product>(`/api/v1/products/${id}`, {
    next: { revalidate: 60 },
  });
}

export async function getProductWithCategory(
  id: number,
): Promise<ProductWithCategory | null> {
  const product = await getProductById(id);

  if (!product) {
    return null;
  }

  const categories = await getCategories();
  const category =
    categories.find((item) => item.id === product.category_id) ?? null;

  return { ...product, category };
}

// ===== Клиентские функции (используются только в "use client") =====

const TOKEN_KEY = 'radio_store_customer_token';

export function getClientToken(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return localStorage.getItem(TOKEN_KEY) ?? '';
}

export function setClientToken(value: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(TOKEN_KEY, value);
}

export function clearClientToken(): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(TOKEN_KEY);
}

async function clientFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  const token = getClientToken();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${CLIENT_API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearClientToken();
      window.dispatchEvent(new Event('auth:logout'));
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

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const clientApi = {
  register(
    email: string,
    password: string,
    fullName: string,
  ): Promise<AuthResponse> {
    return clientFetch<AuthResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name: fullName }),
    });
  },

  login(email: string, password: string): Promise<AuthResponse> {
    return clientFetch<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  me(): Promise<User> {
    return clientFetch<User>('/api/v1/auth/me');
  },

  getCart(): Promise<Cart> {
    return clientFetch<Cart>('/api/v1/cart');
  },

  addCartItem(productId: number, quantity: number): Promise<unknown> {
    return clientFetch('/api/v1/cart/items', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId, quantity }),
    });
  },

  updateCartItem(productId: number, quantity: number): Promise<unknown> {
    return clientFetch(`/api/v1/cart/items/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    });
  },

  deleteCartItem(productId: number): Promise<unknown> {
    return clientFetch(`/api/v1/cart/items/${productId}`, {
      method: 'DELETE',
    });
  },

  createOrder(payload: {
    shippingAddress: string;
    comment: string;
    customerEmail: string;
    customerPhone: string;
  }): Promise<CreateOrderResponse> {
    return clientFetch<CreateOrderResponse>('/api/v1/orders', {
      method: 'POST',
      body: JSON.stringify({
        shipping_address: payload.shippingAddress,
        comment: payload.comment,
        customer_email: payload.customerEmail,
        customer_phone: payload.customerPhone,
      }),
    });
  },

  listOrders(): Promise<Order[]> {
    return clientFetch<Order[]>('/api/v1/orders');
  },

  getOrder(id: number): Promise<Order> {
    return clientFetch<Order>(`/api/v1/orders/${id}`);
  },

  getProductsPrimaryImages(ids: number[]): Promise<ProductPrimaryImage[]> {
    const uniqueIds = Array.from(new Set(ids.filter((id) => id > 0)));

    if (uniqueIds.length === 0) {
      return Promise.resolve([]);
    }

    const query = new URLSearchParams();
    query.set('ids', uniqueIds.join(','));

    return clientFetch<ProductPrimaryImage[]>(
      `/api/v1/products/images?${query.toString()}`,
    );
  },
};