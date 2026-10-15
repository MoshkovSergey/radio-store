package apihttp

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"

	"github.com/example/radio-store/backend/internal/models"
)

type addCartItemRequest struct {
	ProductID int64 `json:"product_id"`
	Quantity  int   `json:"quantity"`
}

type updateCartItemRequest struct {
	Quantity int `json:"quantity"`
}

func parsePathID(r *http.Request, name string) (int64, error) {
	raw := r.PathValue(name)
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id <= 0 {
		return 0, errors.New("invalid id")
	}
	return id, nil
}

func (s *Server) getCart(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	rows, err := s.db.Query(
		r.Context(),
		`
		SELECT
			p.id,
			p.name,
			p.sku,
			p.price_minor,
			p.currency,
			p.attributes,
			c.quantity,
			COALESCE(s.quantity, 0) AS stock_quantity
		FROM cart_items c
		JOIN products p ON p.id = c.product_id
		LEFT JOIN stock s ON s.product_id = p.id
		WHERE c.user_id = $1
		ORDER BY c.created_at, c.product_id
		`,
		userID,
	)
	if err != nil {
		slog.Error("failed to query cart", "user_id", userID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load cart")
		return
	}
	defer rows.Close()

	items := make([]models.CartItem, 0, 16)
	var totalMinor int64
	var currency string

	for rows.Next() {
		var item models.CartItem
		if err := rows.Scan(
			&item.ProductID,
			&item.Name,
			&item.SKU,
			&item.PriceMinor,
			&item.Currency,
			&item.Attributes,
			&item.Quantity,
			&item.StockQuantity,
		); err != nil {
			slog.Error("failed to scan cart item", "user_id", userID, "error", err)
			writeError(w, http.StatusInternalServerError, "failed to load cart")
			return
		}

		if currency == "" {
			currency = item.Currency
		}

		totalMinor += item.PriceMinor * int64(item.Quantity)
		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		slog.Error("cart rows error", "user_id", userID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load cart")
		return
	}

	if currency == "" {
		currency = "RUB"
	}

	writeJSON(w, http.StatusOK, models.Cart{
		Items:      items,
		TotalMinor: totalMinor,
		Currency:   currency,
	})
}

func (s *Server) addCartItem(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req addCartItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.ProductID <= 0 {
		writeError(w, http.StatusBadRequest, "invalid product_id")
		return
	}

	if req.Quantity <= 0 || req.Quantity > 1000 {
		writeError(w, http.StatusBadRequest, "quantity must be between 1 and 1000")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		slog.Error("failed to begin transaction", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to add cart item")
		return
	}
	defer tx.Rollback(r.Context())

	var isActive bool
	err = tx.QueryRow(
		r.Context(),
		`SELECT is_active FROM products WHERE id = $1`,
		req.ProductID,
	).Scan(&isActive)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "product not found")
			return
		}

		slog.Error("failed to check product", "product_id", req.ProductID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to add cart item")
		return
	}

	if !isActive {
		writeError(w, http.StatusBadRequest, "product is not active")
		return
	}

	var stockQuantity int
	err = tx.QueryRow(
		r.Context(),
		`SELECT quantity FROM stock WHERE product_id = $1 FOR UPDATE`,
		req.ProductID,
	).Scan(&stockQuantity)

	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		slog.Error("failed to lock stock", "product_id", req.ProductID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to add cart item")
		return
	}

	var newQuantity int
	err = tx.QueryRow(
		r.Context(),
		`
		INSERT INTO cart_items (user_id, product_id, quantity)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, product_id)
		DO UPDATE SET
			quantity = cart_items.quantity + EXCLUDED.quantity,
			updated_at = now()
		RETURNING quantity
		`,
		userID,
		req.ProductID,
		req.Quantity,
	).Scan(&newQuantity)

	if err != nil {
		slog.Error("failed to upsert cart item", "user_id", userID, "product_id", req.ProductID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to add cart item")
		return
	}

	if newQuantity > stockQuantity {
		writeError(w, http.StatusConflict, "insufficient stock")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("failed to commit add cart item", "user_id", userID, "product_id", req.ProductID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to add cart item")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"product_id": req.ProductID,
		"quantity":   newQuantity,
	})
}

func (s *Server) updateCartItem(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	productID, err := parsePathID(r, "product_id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid product_id")
		return
	}

	var req updateCartItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Quantity <= 0 || req.Quantity > 1000 {
		writeError(w, http.StatusBadRequest, "quantity must be between 1 and 1000")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		slog.Error("failed to begin transaction", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update cart item")
		return
	}
	defer tx.Rollback(r.Context())

	var isActive bool
	err = tx.QueryRow(
		r.Context(),
		`SELECT is_active FROM products WHERE id = $1`,
		productID,
	).Scan(&isActive)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "product not found")
			return
		}

		slog.Error("failed to check product", "product_id", productID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update cart item")
		return
	}

	if !isActive {
		writeError(w, http.StatusBadRequest, "product is not active")
		return
	}

	var stockQuantity int
	err = tx.QueryRow(
		r.Context(),
		`SELECT quantity FROM stock WHERE product_id = $1 FOR UPDATE`,
		productID,
	).Scan(&stockQuantity)

	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		slog.Error("failed to lock stock", "product_id", productID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update cart item")
		return
	}

	var newQuantity int
	err = tx.QueryRow(
		r.Context(),
		`
		UPDATE cart_items
		SET quantity = $3, updated_at = now()
		WHERE user_id = $1 AND product_id = $2
		RETURNING quantity
		`,
		userID,
		productID,
		req.Quantity,
	).Scan(&newQuantity)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "cart item not found")
			return
		}

		slog.Error("failed to update cart item", "user_id", userID, "product_id", productID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update cart item")
		return
	}

	if newQuantity > stockQuantity {
		writeError(w, http.StatusConflict, "insufficient stock")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("failed to commit update cart item", "user_id", userID, "product_id", productID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update cart item")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"product_id": productID,
		"quantity":   newQuantity,
	})
}

func (s *Server) deleteCartItem(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	productID, err := parsePathID(r, "product_id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid product_id")
		return
	}

	tag, err := s.db.Exec(
		r.Context(),
		`
		DELETE FROM cart_items
		WHERE user_id = $1 AND product_id = $2
		`,
		userID,
		productID,
	)
	if err != nil {
		slog.Error("failed to delete cart item", "user_id", userID, "product_id", productID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete cart item")
		return
	}

	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "cart item not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "cart item deleted",
	})
}