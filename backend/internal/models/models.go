package models

import (
	"encoding/json"
	"time"
)

type Category struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Slug     string `json:"slug"`
	ParentID *int64 `json:"parent_id,omitempty"`
}

type ProductImage struct {
	ID        int64   `json:"id"`
	URL       string  `json:"url"`
	Alt       *string `json:"alt,omitempty"`
	Position  int     `json:"position"`
	IsPrimary bool    `json:"is_primary"`
}

type Product struct {
	ID              int64           `json:"id"`
	CategoryID      int64           `json:"category_id"`
	Name            string          `json:"name"`
	Slug            string          `json:"slug"`
	SKU             string          `json:"sku"`
	Manufacturer    *string         `json:"manufacturer,omitempty"`
	Description     *string         `json:"description,omitempty"`
	PriceMinor      int64           `json:"price_minor"`
	Currency        string          `json:"currency"`
	Attributes      json.RawMessage `json:"attributes"`
	StockQuantity   int             `json:"stock_quantity"`
	IsActive        bool            `json:"is_active"`
	PrimaryImageURL *string         `json:"primary_image_url,omitempty"`
	Images          []ProductImage  `json:"images,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

type User struct {
	ID       int64   `json:"id"`
	Email    string  `json:"email"`
	FullName *string `json:"full_name,omitempty"`
	Role     string  `json:"role"`
}

type CartItem struct {
	ProductID     int64           `json:"product_id"`
	Name          string          `json:"name"`
	SKU           string          `json:"sku"`
	PriceMinor    int64           `json:"price_minor"`
	Currency      string          `json:"currency"`
	Attributes    json.RawMessage `json:"attributes"`
	Quantity      int             `json:"quantity"`
	StockQuantity int             `json:"stock_quantity"`
}

type Cart struct {
	Items      []CartItem `json:"items"`
	TotalMinor int64      `json:"total_minor"`
	Currency   string     `json:"currency"`
}

type OrderItem struct {
	ID         int64  `json:"id"`
	ProductID  int64  `json:"product_id"`
	Name       string `json:"name"`
	SKU        string `json:"sku"`
	Quantity   int    `json:"quantity"`
	PriceMinor int64  `json:"price_minor"`
}

type Order struct {
	ID              int64       `json:"id"`
	Status          string      `json:"status"`
	TotalMinor      int64       `json:"total_minor"`
	Currency        string      `json:"currency"`
	ShippingAddress *string     `json:"shipping_address,omitempty"`
	Comment         *string     `json:"comment,omitempty"`
	CustomerEmail   *string     `json:"customer_email,omitempty"`
	CustomerPhone   *string     `json:"customer_phone,omitempty"`
	CreatedAt       time.Time   `json:"created_at"`
	UpdatedAt       time.Time   `json:"updated_at"`
	Items           []OrderItem `json:"items,omitempty"`
}

type OrderInvoice struct {
	ID          int64      `json:"id"`
	OrderID     int64      `json:"order_id"`
	Number      string     `json:"number"`
	AmountMinor int64      `json:"amount_minor"`
	Currency    string     `json:"currency"`
	Status      string     `json:"status"`
	IssuedAt    time.Time  `json:"issued_at"`
	SentAt      *time.Time `json:"sent_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}