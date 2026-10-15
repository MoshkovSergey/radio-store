export interface Category {
  id: number;
  name: string;
  slug: string;
  parent_id?: number | null;
}

export interface ProductImage {
  id: number;
  url: string;
  alt?: string | null;
  position: number;
  is_primary: boolean;
}

export interface Product {
  id: number;
  category_id: number;
  name: string;
  slug: string;
  sku: string;
  manufacturer?: string | null;
  description?: string | null;
  price_minor: number;
  currency: string;
  attributes: Record<string, unknown>;
  stock_quantity: number;
  is_active: boolean;
  primary_image_url?: string | null;
  images?: ProductImage[];
  created_at: string;
  updated_at: string;
}

export interface ProductWithCategory extends Product {
  category?: Category | null;
}

export interface ProductPrimaryImage {
  product_id: number;
  primary_image_url: string;
}

export interface User {
  id: number;
  email: string;
  full_name?: string;
  role: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface CartItem {
  product_id: number;
  name: string;
  sku: string;
  price_minor: number;
  currency: string;
  attributes: Record<string, unknown>;
  quantity: number;
  stock_quantity: number;
}

export interface Cart {
  items: CartItem[];
  total_minor: number;
  currency: string;
}

export interface OrderItem {
  id: number;
  product_id: number;
  name: string;
  sku: string;
  quantity: number;
  price_minor: number;
}

export interface Order {
  id: number;
  status: string;
  total_minor: number;
  currency: string;
  shipping_address?: string | null;
  comment?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface CreateOrderResponse {
  id: number;
  status: string;
  total_minor: number;
  currency: string;
}