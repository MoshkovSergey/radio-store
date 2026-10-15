package apihttp

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func (s *Server) adminMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return s.authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if userRoleFromContext(r.Context()) != "admin" {
			writeError(w, http.StatusForbidden, "admin access required")
			return
		}
		next(w, r)
	})
}

type adminCategoryRequest struct {
	Name     string `json:"name"`
	Slug     string `json:"slug"`
	ParentID *int64 `json:"parent_id"`
}

type adminCategoryResponse struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Slug     string `json:"slug"`
	ParentID *int64 `json:"parent_id,omitempty"`
}

type adminProductRequest struct {
	CategoryID    int64           `json:"category_id"`
	Name          string          `json:"name"`
	Slug          string          `json:"slug"`
	SKU           string          `json:"sku"`
	Manufacturer  *string         `json:"manufacturer"`
	Description   *string         `json:"description"`
	PriceMinor    int64           `json:"price_minor"`
	Currency      string          `json:"currency"`
	Attributes    json.RawMessage `json:"attributes"`
	IsActive      *bool           `json:"is_active"`
	StockQuantity *int            `json:"stock_quantity"`
}

type adminProductResponse struct {
	ID              int64           `json:"id"`
	CategoryID      int64           `json:"category_id"`
	CategoryName    string          `json:"category_name"`
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
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

type adminStockRequest struct {
	Quantity int `json:"quantity"`
}

type adminOrderStatusRequest struct {
	Status string `json:"status"`
}

type adminOrderResponse struct {
	ID              int64     `json:"id"`
	Status          string    `json:"status"`
	TotalMinor      int64     `json:"total_minor"`
	Currency        string    `json:"currency"`
	ShippingAddress *string   `json:"shipping_address,omitempty"`
	Comment         *string   `json:"comment,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type dbQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

const adminProductSelect = `
SELECT
	p.id,
	p.category_id,
	c.name AS category_name,
	p.name,
	p.slug,
	p.sku,
	p.manufacturer,
	p.description,
	p.price_minor,
	p.currency,
	p.attributes,
	COALESCE(s.quantity, 0) AS stock_quantity,
	p.is_active,
	(
		SELECT pi.url
		FROM product_images pi
		WHERE pi.product_id = p.id
		ORDER BY pi.is_primary DESC, pi.position ASC, pi.id ASC
		LIMIT 1
	) AS primary_image_url,
	p.created_at,
	p.updated_at
FROM products p
JOIN categories c ON c.id = p.category_id
LEFT JOIN stock s ON s.product_id = p.id
`

func nullIfEmpty(value *string) *string {
	if value == nil {
		return nil
	}

	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}

	return &trimmed
}

func isPgErrorCode(err error, code string) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == code
}

func (s *Server) fetchAdminProduct(ctx context.Context, q dbQuerier, productID int64) (adminProductResponse, error) {
	var product adminProductResponse

	err := q.QueryRow(
		ctx,
		adminProductSelect+" WHERE p.id = $1",
		productID,
	).Scan(
		&product.ID,
		&product.CategoryID,
		&product.CategoryName,
		&product.Name,
		&product.Slug,
		&product.SKU,
		&product.Manufacturer,
		&product.Description,
		&product.PriceMinor,
		&product.Currency,
		&product.Attributes,
		&product.StockQuantity,
		&product.IsActive,
		&product.PrimaryImageURL,
		&product.CreatedAt,
		&product.UpdatedAt,
	)

	return product, err
}

func (s *Server) adminListProducts(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), adminProductSelect+" ORDER BY p.id DESC")
	if err != nil {
		slog.Error("failed to query admin products", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load products")
		return
	}
	defer rows.Close()

	products := make([]adminProductResponse, 0, 64)

	for rows.Next() {
		var product adminProductResponse
		if err := rows.Scan(
			&product.ID,
			&product.CategoryID,
			&product.CategoryName,
			&product.Name,
			&product.Slug,
			&product.SKU,
			&product.Manufacturer,
			&product.Description,
			&product.PriceMinor,
			&product.Currency,
			&product.Attributes,
			&product.StockQuantity,
			&product.IsActive,
			&product.PrimaryImageURL,
			&product.CreatedAt,
			&product.UpdatedAt,
		); err != nil {
			slog.Error("failed to scan admin product", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to load products")
			return
		}

		products = append(products, product)
	}

	if err := rows.Err(); err != nil {
		slog.Error("admin product rows error", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load products")
		return
	}

	writeJSON(w, http.StatusOK, products)
}

func (s *Server) adminCreateProduct(w http.ResponseWriter, r *http.Request) {
	var req adminProductRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	name := strings.TrimSpace(req.Name)
	slug := strings.TrimSpace(req.Slug)
	sku := strings.TrimSpace(req.SKU)

	if req.CategoryID <= 0 || name == "" || slug == "" || sku == "" {
		writeError(w, http.StatusBadRequest, "category_id, name, slug and sku are required")
		return
	}

	if req.PriceMinor < 0 {
		writeError(w, http.StatusBadRequest, "price_minor cannot be negative")
		return
	}

	currency := strings.ToUpper(strings.TrimSpace(req.Currency))
	if currency == "" {
		currency = "RUB"
	}
	if len(currency) != 3 {
		writeError(w, http.StatusBadRequest, "currency must be a 3-letter code")
		return
	}

	attributes := req.Attributes
	if len(attributes) == 0 || string(attributes) == "null" {
		attributes = json.RawMessage("{}")
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	stockQuantity := 0
	if req.StockQuantity != nil {
		stockQuantity = *req.StockQuantity
	}
	if stockQuantity < 0 {
		writeError(w, http.StatusBadRequest, "stock_quantity cannot be negative")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		slog.Error("failed to begin transaction", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create product")
		return
	}
	defer tx.Rollback(r.Context())

	var productID int64
	err = tx.QueryRow(
		r.Context(),
		`
		INSERT INTO products (
			category_id,
			name,
			slug,
			sku,
			manufacturer,
			description,
			price_minor,
			currency,
			attributes,
			is_active
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id
		`,
		req.CategoryID,
		name,
		slug,
		sku,
		nullIfEmpty(req.Manufacturer),
		nullIfEmpty(req.Description),
		req.PriceMinor,
		currency,
		attributes,
		isActive,
	).Scan(&productID)

	if err != nil {
		if isPgErrorCode(err, "23505") {
			writeError(w, http.StatusConflict, "product with this slug or sku already exists")
			return
		}
		if isPgErrorCode(err, "23503") {
			writeError(w, http.StatusBadRequest, "category not found")
			return
		}

		slog.Error("failed to insert product", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create product")
		return
	}

	_, err = tx.Exec(
		r.Context(),
		`
		INSERT INTO stock (product_id, quantity)
		VALUES ($1, $2)
		ON CONFLICT (product_id)
		DO UPDATE SET
			quantity = EXCLUDED.quantity,
			updated_at = now()
		`,
		productID,
		stockQuantity,
	)
	if err != nil {
		slog.Error("failed to upsert stock", "product_id", productID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create product")
		return
	}

	product, err := s.fetchAdminProduct(r.Context(), tx, productID)
	if err != nil {
		slog.Error("failed to fetch created product", "product_id", productID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create product")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("failed to commit product creation", "product_id", productID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create product")
		return
	}

	writeJSON(w, http.StatusCreated, product)
}

func (s *Server) adminUpdateProduct(w http.ResponseWriter, r *http.Request) {
	productID, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid product id")
		return
	}

	var req adminProductRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	name := strings.TrimSpace(req.Name)
	slug := strings.TrimSpace(req.Slug)
	sku := strings.TrimSpace(req.SKU)

	if req.CategoryID <= 0 || name == "" || slug == "" || sku == "" {
		writeError(w, http.StatusBadRequest, "category_id, name, slug and sku are required")
		return
	}

	if req.PriceMinor < 0 {
		writeError(w, http.StatusBadRequest, "price_minor cannot be negative")
		return
	}

	currency := strings.ToUpper(strings.TrimSpace(req.Currency))
	if currency == "" {
		currency = "RUB"
	}
	if len(currency) != 3 {
		writeError(w, http.StatusBadRequest, "currency must be a 3-letter code")
		return
	}

	attributes := req.Attributes
	if len(attributes) == 0 || string(attributes) == "null" {
		attributes = json.RawMessage("{}")
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		slog.Error("failed to begin transaction", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update product")
		return
	}
	defer tx.Rollback(r.Context())

	var updatedProductID int64
	err = tx.QueryRow(
		r.Context(),
		`
		UPDATE products
		SET
			category_id = $2,
			name = $3,
			slug = $4,
			sku = $5,
			manufacturer = $6,
			description = $7,
			price_minor = $8,
			currency = $9,
			attributes = $10,
			is_active = $11,
			updated_at = now()
		WHERE id = $1
		RETURNING id
		`,
		productID,
		req.CategoryID,
		name,
		slug,
		sku,
		nullIfEmpty(req.Manufacturer),
		nullIfEmpty(req.Description),
		req.PriceMinor,
		currency,
		attributes,
		isActive,
	).Scan(&updatedProductID)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "product not found")
			return
		}
		if isPgErrorCode(err, "23505") {
			writeError(w, http.StatusConflict, "product with this slug or sku already exists")
			return
		}
		if isPgErrorCode(err, "23503") {
			writeError(w, http.StatusBadRequest, "category not found")
			return
		}

		slog.Error("failed to update product", "product_id", productID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update product")
		return
	}

	if req.StockQuantity != nil {
		if *req.StockQuantity < 0 {
			writeError(w, http.StatusBadRequest, "stock_quantity cannot be negative")
			return
		}

		_, err = tx.Exec(
			r.Context(),
			`
			INSERT INTO stock (product_id, quantity)
			VALUES ($1, $2)
			ON CONFLICT (product_id)
			DO UPDATE SET
				quantity = EXCLUDED.quantity,
				updated_at = now()
			`,
			productID,
			*req.StockQuantity,
		)
		if err != nil {
			slog.Error("failed to upsert stock", "product_id", productID, "error", err)
			writeError(w, http.StatusInternalServerError, "failed to update product")
			return
		}
	}

	product, err := s.fetchAdminProduct(r.Context(), tx, productID)
	if err != nil {
		slog.Error("failed to fetch updated product", "product_id", productID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update product")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("failed to commit product update", "product_id", productID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update product")
		return
	}

	writeJSON(w, http.StatusOK, product)
}

func (s *Server) adminSetStock(w http.ResponseWriter, r *http.Request) {
	productID, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid product id")
		return
	}

	var req adminStockRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Quantity < 0 {
		writeError(w, http.StatusBadRequest, "quantity cannot be negative")
		return
	}

	_, err = s.db.Exec(
		r.Context(),
		`
		INSERT INTO stock (product_id, quantity)
		VALUES ($1, $2)
		ON CONFLICT (product_id)
		DO UPDATE SET
			quantity = EXCLUDED.quantity,
			updated_at = now()
		`,
		productID,
		req.Quantity,
	)
	if err != nil {
		if isPgErrorCode(err, "23503") {
			writeError(w, http.StatusNotFound, "product not found")
			return
		}

		slog.Error("failed to set stock", "product_id", productID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to set stock")
		return
	}

	product, err := s.fetchAdminProduct(r.Context(), s.db, productID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "product not found")
			return
		}

		slog.Error("failed to fetch product after stock update", "product_id", productID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to set stock")
		return
	}

	writeJSON(w, http.StatusOK, product)
}

func (s *Server) adminListCategories(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(
		r.Context(),
		`SELECT id, name, slug, parent_id FROM categories ORDER BY name`,
	)
	if err != nil {
		slog.Error("failed to query categories", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load categories")
		return
	}
	defer rows.Close()

	categories := make([]adminCategoryResponse, 0, 16)

	for rows.Next() {
		var category adminCategoryResponse
		if err := rows.Scan(&category.ID, &category.Name, &category.Slug, &category.ParentID); err != nil {
			slog.Error("failed to scan category", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to load categories")
			return
		}
		categories = append(categories, category)
	}

	if err := rows.Err(); err != nil {
		slog.Error("category rows error", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load categories")
		return
	}

	writeJSON(w, http.StatusOK, categories)
}

func (s *Server) adminCreateCategory(w http.ResponseWriter, r *http.Request) {
	var req adminCategoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	name := strings.TrimSpace(req.Name)
	slug := strings.TrimSpace(req.Slug)

	if name == "" || slug == "" {
		writeError(w, http.StatusBadRequest, "name and slug are required")
		return
	}

	if req.ParentID != nil && *req.ParentID <= 0 {
		req.ParentID = nil
	}

	var category adminCategoryResponse
	err := s.db.QueryRow(
		r.Context(),
		`
		INSERT INTO categories (name, slug, parent_id)
		VALUES ($1, $2, $3)
		RETURNING id, name, slug, parent_id
		`,
		name,
		slug,
		req.ParentID,
	).Scan(&category.ID, &category.Name, &category.Slug, &category.ParentID)

	if err != nil {
		if isPgErrorCode(err, "23505") {
			writeError(w, http.StatusConflict, "category with this slug already exists")
			return
		}
		if isPgErrorCode(err, "23503") {
			writeError(w, http.StatusBadRequest, "parent category not found")
			return
		}

		slog.Error("failed to create category", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create category")
		return
	}

	writeJSON(w, http.StatusCreated, category)
}

func (s *Server) adminUpdateCategory(w http.ResponseWriter, r *http.Request) {
	categoryID, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid category id")
		return
	}

	var req adminCategoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	name := strings.TrimSpace(req.Name)
	slug := strings.TrimSpace(req.Slug)

	if name == "" || slug == "" {
		writeError(w, http.StatusBadRequest, "name and slug are required")
		return
	}

	if req.ParentID != nil && *req.ParentID <= 0 {
		req.ParentID = nil
	}

	var category adminCategoryResponse
	err = s.db.QueryRow(
		r.Context(),
		`
		UPDATE categories
		SET name = $2, slug = $3, parent_id = $4
		WHERE id = $1
		RETURNING id, name, slug, parent_id
		`,
		categoryID,
		name,
		slug,
		req.ParentID,
	).Scan(&category.ID, &category.Name, &category.Slug, &category.ParentID)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "category not found")
			return
		}
		if isPgErrorCode(err, "23505") {
			writeError(w, http.StatusConflict, "category with this slug already exists")
			return
		}
		if isPgErrorCode(err, "23503") {
			writeError(w, http.StatusBadRequest, "parent category not found")
			return
		}

		slog.Error("failed to update category", "category_id", categoryID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update category")
		return
	}

	writeJSON(w, http.StatusOK, category)
}

func (s *Server) adminDeleteCategory(w http.ResponseWriter, r *http.Request) {
	categoryID, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid category id")
		return
	}

	tag, err := s.db.Exec(
		r.Context(),
		`DELETE FROM categories WHERE id = $1`,
		categoryID,
	)
	if err != nil {
		if isPgErrorCode(err, "23503") {
			writeError(w, http.StatusConflict, "category cannot be deleted because it is in use")
			return
		}

		slog.Error("failed to delete category", "category_id", categoryID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete category")
		return
	}

	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "category not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "category deleted",
	})
}

func (s *Server) adminUpdateOrderStatus(w http.ResponseWriter, r *http.Request) {
	orderID, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid order id")
		return
	}

	var req adminOrderStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	status := strings.ToLower(strings.TrimSpace(req.Status))
	allowedStatuses := map[string]struct{}{
		"new":        {},
		"processing": {},
		"paid":       {},
		"shipped":    {},
		"completed":  {},
		"cancelled":  {},
	}

	if _, ok := allowedStatuses[status]; !ok {
		writeError(w, http.StatusBadRequest, "invalid order status")
		return
	}

	var order adminOrderResponse
	err = s.db.QueryRow(
		r.Context(),
		`
		UPDATE orders
		SET status = $2, updated_at = now()
		WHERE id = $1
		RETURNING id, status, total_minor, currency, shipping_address, comment, created_at, updated_at
		`,
		orderID,
		status,
	).Scan(
		&order.ID,
		&order.Status,
		&order.TotalMinor,
		&order.Currency,
		&order.ShippingAddress,
		&order.Comment,
		&order.CreatedAt,
		&order.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "order not found")
			return
		}

		slog.Error("failed to update order status", "order_id", orderID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update order status")
		return
	}

	writeJSON(w, http.StatusOK, order)
}

var _ = strconv.Itoa