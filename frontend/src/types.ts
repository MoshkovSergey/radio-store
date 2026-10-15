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

export interface AdminUser {
	id: number;
	email: string;
	full_name?: string | null;
	role: string;
	created_at: string;
	updated_at: string;
}

export interface ProductImage {
	id: number;
	url: string;
	alt?: string | null;
	position: number;
	is_primary: boolean;
}

export interface Category {
	id: number;
	name: string;
	slug: string;
	parent_id?: number | null;
}

export interface CategoryPayload {
	name: string;
	slug: string;
	parent_id?: number | null;
}

export interface AdminProduct {
	id: number;
	category_id: number;
	category_name: string;
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
	created_at: string;
	updated_at: string;
}

export interface ProductPayload {
	category_id: number;
	name: string;
	slug: string;
	sku: string;
	manufacturer?: string | null;
	description?: string | null;
	price_minor: number;
	currency: string;
	attributes: Record<string, unknown>;
	is_active: boolean;
	stock_quantity?: number;
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
	created_at: string;
	updated_at: string;
	items?: OrderItem[];
}