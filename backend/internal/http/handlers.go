package apihttp

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/example/radio-store/backend/internal/models"
)

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) listCategories(w http.ResponseWriter, r *http.Request) {
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

	categories := make([]models.Category, 0, 16)
	for rows.Next() {
		var c models.Category
		if err := rows.Scan(&c.ID, &c.Name, &c.Slug, &c.ParentID); err != nil {
			slog.Error("failed to scan category", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to load categories")
			return
		}
		categories = append(categories, c)
	}

	if err := rows.Err(); err != nil {
		slog.Error("category rows error", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load categories")
		return
	}

	writeJSON(w, http.StatusOK, categories)
}

func (s *Server) listProducts(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	limit, err := strconv.Atoi(q.Get("limit"))
	if err != nil || limit <= 0 || limit > 100 {
		limit = 20
	}

	offset, err := strconv.Atoi(q.Get("offset"))
	if err != nil || offset < 0 {
		offset = 0
	}

	args := []any{}
	conditions := []string{"p.is_active = TRUE"}

	if categoryIDRaw := q.Get("category_id"); categoryIDRaw != "" {
		categoryID, err := strconv.ParseInt(categoryIDRaw, 10, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid category_id")
			return
		}
		args = append(args, categoryID)
		conditions = append(conditions, fmt.Sprintf("p.category_id = $%d", len(args)))
	}

	if search := strings.TrimSpace(q.Get("search")); search != "" {
		escaped := strings.NewReplacer("%", `\%`, "_", `\_`).Replace(search)
		pattern := "%" + escaped + "%"
		args = append(args, pattern)
		n := len(args)
		conditions = append(
			conditions,
			fmt.Sprintf(
				"(p.name ILIKE $%d OR p.sku ILIKE $%d OR p.manufacturer ILIKE $%d)",
				n,
				n,
				n,
			),
		)
	}

	args = append(args, limit, offset)
	limitIndex := len(args) - 1
	offsetIndex := len(args)

	query := fmt.Sprintf(
		`
		SELECT
			p.id,
			p.category_id,
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
			p.created_at,
			p.updated_at
		FROM products p
		LEFT JOIN stock s ON s.product_id = p.id
		WHERE %s
		ORDER BY p.id DESC
		LIMIT $%d OFFSET $%d
		`,
		strings.Join(conditions, " AND "),
		limitIndex,
		offsetIndex,
	)

	rows, err := s.db.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("failed to query products", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load products")
		return
	}
	defer rows.Close()

	products := make([]models.Product, 0, limit)
	for rows.Next() {
		var p models.Product
		if err := rows.Scan(
			&p.ID,
			&p.CategoryID,
			&p.Name,
			&p.Slug,
			&p.SKU,
			&p.Manufacturer,
			&p.Description,
			&p.PriceMinor,
			&p.Currency,
			&p.Attributes,
			&p.StockQuantity,
			&p.IsActive,
			&p.CreatedAt,
			&p.UpdatedAt,
		); err != nil {
			slog.Error("failed to scan product", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to load products")
			return
		}
		products = append(products, p)
	}

	if err := rows.Err(); err != nil {
		slog.Error("product rows error", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load products")
		return
	}

	writeJSON(w, http.StatusOK, products)
}

func (s *Server) getProduct(w http.ResponseWriter, r *http.Request) {
	idRaw := r.PathValue("id")
	id, err := strconv.ParseInt(idRaw, 10, 64)
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "invalid product id")
		return
	}

	row := s.db.QueryRow(
		r.Context(),
		`
		SELECT
			p.id,
			p.category_id,
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
			p.created_at,
			p.updated_at
		FROM products p
		LEFT JOIN stock s ON s.product_id = p.id
		WHERE p.id = $1
		`,
		id,
	)

	var p models.Product
	err = row.Scan(
		&p.ID,
		&p.CategoryID,
		&p.Name,
		&p.Slug,
		&p.SKU,
		&p.Manufacturer,
		&p.Description,
		&p.PriceMinor,
		&p.Currency,
		&p.Attributes,
		&p.StockQuantity,
		&p.IsActive,
		&p.CreatedAt,
		&p.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "product not found")
			return
		}

		slog.Error("failed to get product", "product_id", id, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load product")
		return
	}

	writeJSON(w, http.StatusOK, p)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("failed to encode response", "error", err)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}