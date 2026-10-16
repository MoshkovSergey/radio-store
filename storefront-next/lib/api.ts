import type {
  AuthResponse,
  BlogPost,
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

// ===== Блог =====
//
// getBlogPosts и getAllBlogPostsForSitemap сделаны НЕKEШИРУЕМЫМИ
// (cache: 'no-store'), чтобы /blog и /sitemap.xml отдавали свежий набор
// опубликованных статей сразу после публикации/удаления в админке,
// без лага ISR. Параметр revalidate в сигнатурах сохранён как
// необязательный и намеренно игнорируется в теле — чтобы не ломать
// существующие вызовы (лишнее свойство в литерале объекта упало бы
// по типам, если убрать параметр, не тронув вызывающий код).
//
// getBlogPostBySlug оставлен с ISR (revalidate: 300): новая статья
// рендерится on-demand по своему slug сразу, а правка текста уже
// существующей статьи обновится с лагом до 5 минут — это не
// "добавление", и на sitemap/список не влияет.

export interface BlogPostWithStats extends BlogPost {
  views_count: number;
  likes_count: number;
}

export interface BlogEngagementResponse {
  views_count: number;
  likes_count: number;
  liked: boolean;
}

export interface BlogViewResponse {
  views_count: number;
  likes_count: number;
}

export interface BlogLikeResponse {
  liked: boolean;
  views_count: number;
  likes_count: number;
}

export async function getBlogPosts(params: {
  limit?: number;
  offset?: number;
  revalidate?: number;
} = {}): Promise<BlogPostWithStats[]> {
  const query = new URLSearchParams();
  query.set('limit', String(params.limit ?? 20));

  if (params.offset !== undefined) {
    query.set('offset', String(params.offset));
  }

  const data = await serverFetch<BlogPostWithStats[]>(
    `/api/v1/blog/posts?${query.toString()}`,
    { cache: 'no-store' },
  );

  return data ?? [];
}

export async function getBlogPostBySlug(
  slug: string,
): Promise<BlogPostWithStats | null> {
  return serverFetch<BlogPostWithStats>(
    `/api/v1/blog/posts/${encodeURIComponent(slug)}`,
    {
      next: { revalidate: 300 },
    },
  );
}

export async function getAllBlogPostsForSitemap(): Promise<BlogPostWithStats[]> {
  const data = await serverFetch<BlogPostWithStats[]>(
    '/api/v1/blog/posts?limit=100',
    {
      cache: 'no-store',
    },
  );

  return data ?? [];
}

// ===== Клиентские функции (используются только в "use client") =====

const TOKEN_KEY = 'radio_store_customer_token';
const BLOG_VISITOR_TOKEN_KEY = 'radio_store_blog_visitor_token';

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

function generateBrowserToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);

    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getBlogVisitorToken(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  const existing = localStorage.getItem(BLOG_VISITOR_TOKEN_KEY);

  if (existing) {
    return existing;
  }

  const token = generateBrowserToken();
  localStorage.setItem(BLOG_VISITOR_TOKEN_KEY, token);

  return token;
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

export async function getBlogEngagement(
  slug: string,
): Promise<BlogEngagementResponse> {
  const visitorToken = getBlogVisitorToken();
  const query = new URLSearchParams();

  if (visitorToken) {
    query.set('visitor_token', visitorToken);
  }

  return clientFetch<BlogEngagementResponse>(
    `/api/v1/blog/posts/${encodeURIComponent(slug)}/engagement?${query.toString()}`,
  );
}

export async function recordBlogPostView(
  slug: string,
): Promise<BlogViewResponse> {
  return clientFetch<BlogViewResponse>(
    `/api/v1/blog/posts/${encodeURIComponent(slug)}/view`,
    {
      method: 'POST',
    },
  );
}

export async function toggleBlogPostLike(
  slug: string,
): Promise<BlogLikeResponse> {
  const visitorToken = getBlogVisitorToken();

  return clientFetch<BlogLikeResponse>(
    `/api/v1/blog/posts/${encodeURIComponent(slug)}/like`,
    {
      method: 'POST',
      body: JSON.stringify({ visitor_token: visitorToken }),
    },
  );
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