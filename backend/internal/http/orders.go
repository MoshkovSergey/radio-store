package apihttp

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/mail"
	"strings"
	"unicode"

	"github.com/jackc/pgx/v5"

	"github.com/example/radio-store/backend/internal/models"
)

type createOrderRequest struct {
	ShippingAddress string `json:"shipping_address"`
	Comment         string `json:"comment"`
	CustomerEmail   string `json:"customer_email"`
	CustomerPhone   string `json:"customer_phone"`
}

type cartItemDraft struct {
	ProductID int64
	Quantity  int
}

type productSnapshot struct {
	Name       string
	SKU        string
	PriceMinor int64
	Currency   string
}

type orderItemDraft struct {
	ProductID  int64
	Name       string
	SKU        string
	Quantity   int
	PriceMinor int64
}

// normalizeCustomerEmail валидирует email через net/mail и возвращает
// нормализованный адрес (без display-name). Пустая строка -> nil (NULL в БД),
// чтобы не ломать клиентов, которые контакты пока не шлют (например Flutter).
// Непустая невалидная строка -> ошибка.
func normalizeCustomerEmail(raw string) (*string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, nil
	}

	addr, err := mail.ParseAddress(trimmed)
	if err != nil {
		return nil, errors.New("invalid customer email")
	}

	address := strings.TrimSpace(addr.Address)
	if address == "" {
		return nil, errors.New("invalid customer email")
	}

	return &address, nil
}

// normalizeCustomerPhone валидирует телефон по количеству цифр (6..15,
// потолок E.164) без внешних зависимостей. Пустая строка -> nil (NULL).
func normalizeCustomerPhone(raw string) (*string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, nil
	}

	digits := 0
	for _, r := range trimmed {
		if unicode.IsDigit(r) {
			digits++
		}
	}

	if digits < 6 || digits > 15 {
		return nil, errors.New("invalid customer phone")
	}

	return &trimmed, nil
}

func (s *Server) createOrder(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req createOrderRequest
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
	}

	shippingAddress := strings.TrimSpace(req.ShippingAddress)
	comment := strings.TrimSpace(req.Comment)

	var shippingAddressPtr *string
	if shippingAddress != "" {
		shippingAddressPtr = &shippingAddress
	}

	var commentPtr *string
	if comment != "" {
		commentPtr = &comment
	}

	customerEmailPtr, err := normalizeCustomerEmail(req.CustomerEmail)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	customerPhonePtr, err := normalizeCustomerPhone(req.CustomerPhone)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		slog.Error("failed to begin transaction", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create order")
		return
	}
	defer tx.Rollback(r.Context())

	cartRows, err := tx.Query(
		r.Context(),
		`
		SELECT product_id, quantity
		FROM cart_items
		WHERE user_id = $1
		ORDER BY product_id
		FOR UPDATE
		`,
		userID,
	)
	if err != nil {
		slog.Error("failed to lock cart items", "user_id", userID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create order")
		return
	}

	cartItems := make([]cartItemDraft, 0, 16)
	productIDs := make([]int64, 0, 16)

	for cartRows.Next() {
		var item cartItemDraft
		if err := cartRows.Scan(&item.ProductID, &item.Quantity); err != nil {
			cartRows.Close()
			slog.Error("failed to scan cart item", "user_id", userID, "error", err)
			writeError(w, http.StatusInternalServerError, "failed to create order")
			return
		}
		cartItems = append(cartItems, item)
		productIDs = append(productIDs, item.ProductID)
	}

	if err := cartRows.Err(); err != nil {
		cartRows.Close()
		slog.Error("cart rows error", "user_id", userID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create order")
		return
	}
	cartRows.Close()

	if len(cartItems) == 0 {
		writeError(w, http.StatusBadRequest, "cart is empty")
		return
	}

	stockRows, err := tx.Query(
		r.Context(),
		`
		SELECT product_id, quantity
		FROM stock
		WHERE product_id = ANY($1)
		FOR UPDATE
		`,
		productIDs,
	)
	if err != nil {
		slog.Error("failed to lock stock", "user_id", userID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create order")
		return
	}

	stockMap := make(map[int64]int, len(productIDs))
	for stockRows.Next() {
		var productID int64
		var quantity int
		if err := stockRows.Scan(&productID, &quantity); err != nil {
			stockRows.Close()
			slog.Error("failed to scan stock row", "user_id", userID, "error", err)
			writeError(w, http.StatusInternalServerError, "failed to create order")
			return
		}
		stockMap[productID] = quantity
	}

	if err := stockRows.Err(); err != nil {
		stockRows.Close()
		slog.Error("stock rows error", "user_id", userID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create order")
		return
	}
	stockRows.Close()

	productRows, err := tx.Query(
		r.Context(),
		`
		SELECT id, name, sku, price_minor, currency
		FROM products
		WHERE id = ANY($1) AND is_active = TRUE
		`,
		productIDs,
	)
	if err != nil {
		slog.Error("failed to query products", "user_id", userID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create order")
		return
	}

	productMap := make(map[int64]productSnapshot, len(productIDs))
	for productRows.Next() {
		var id int64
		var snapshot productSnapshot
		if err := productRows.Scan(&id, &snapshot.Name, &snapshot.SKU, &snapshot.PriceMinor, &snapshot.Currency); err != nil {
			productRows.Close()
			slog.Error("failed to scan product row", "user_id", userID, "error", err)
			writeError(w, http.StatusInternalServerError, "failed to create order")
			return
		}
		productMap[id] = snapshot
	}

	if err := productRows.Err(); err != nil {
		productRows.Close()
		slog.Error("product rows error", "user_id", userID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create order")
		return
	}
	productRows.Close()

	if len(productMap) != len(productIDs) {
		writeError(w, http.StatusConflict, "some products are unavailable")
		return
	}

	orderItems := make([]orderItemDraft, 0, len(cartItems))
	var totalMinor int64
	var currency string

	for _, item := range cartItems {
		stockQuantity, ok := stockMap[item.ProductID]
		if !ok || stockQuantity < item.Quantity {
			writeError(w, http.StatusConflict, "insufficient stock")
			return
		}

		product, ok := productMap[item.ProductID]
		if !ok {
			writeError(w, http.StatusConflict, "some products are unavailable")
			return
		}

		if currency == "" {
			currency = product.Currency
		} else if currency != product.Currency {
			writeError(w, http.StatusBadRequest, "cart contains products with different currencies")
			return
		}

		totalMinor += product.PriceMinor * int64(item.Quantity)

		orderItems = append(orderItems, orderItemDraft{
			ProductID:  item.ProductID,
			Name:       product.Name,
			SKU:        product.SKU,
			Quantity:   item.Quantity,
			PriceMinor: product.PriceMinor,
		})
	}

	if currency == "" {
		currency = "RUB"
	}

	var orderID int64
	err = tx.QueryRow(
		r.Context(),
		`
		INSERT INTO orders (
			user_id,
			status,
			total_minor,
			currency,
			shipping_address,
			comment,
			customer_email,
			customer_phone
		)
		VALUES ($1, 'new', $2, $3, $4, $5, $6, $7)
		RETURNING id
		`,
		userID,
		totalMinor,
		currency,
		shippingAddressPtr,
		commentPtr,
		customerEmailPtr,
		customerPhonePtr,
	).Scan(&orderID)

	if err != nil {
		slog.Error("failed to insert order", "user_id", userID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create order")
		return
	}

	for _, item := range orderItems {
		_, err := tx.Exec(
			r.Context(),
			`
			INSERT INTO order_items (
				order_id,
				product_id,
				name,
				sku,
				quantity,
				price_minor
			)
			VALUES ($1, $2, $3, $4, $5, $6)
			`,
			orderID,
			item.ProductID,
			item.Name,
			item.SKU,
			item.Quantity,
			item.PriceMinor,
		)
		if err != nil {
			slog.Error("failed to insert order item", "order_id", orderID, "product_id", item.ProductID, "error", err)
			writeError(w, http.StatusInternalServerError, "failed to create order")
			return
		}
	}

	for _, item := range cartItems {
		tag, err := tx.Exec(
			r.Context(),
			`
			UPDATE stock
			SET quantity = quantity - $2, updated_at = now()
			WHERE product_id = $1 AND quantity >= $2
			`,
			item.ProductID,
			item.Quantity,
		)
		if err != nil {
			slog.Error("failed to decrement stock", "order_id", orderID, "product_id", item.ProductID, "error", err)
			writeError(w, http.StatusInternalServerError, "failed to create order")
			return
		}

		if tag.RowsAffected() != 1 {
			writeError(w, http.StatusConflict, "insufficient stock")
			return
		}
	}

	if _, err := tx.Exec(
		r.Context(),
		`DELETE FROM cart_items WHERE user_id = $1`,
		userID,
	); err != nil {
		slog.Error("failed to clear cart", "order_id", orderID, "user_id", userID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create order")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("failed to commit order", "order_id", orderID, "user_id", userID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create order")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":          orderID,
		"status":      "new",
		"total_minor": totalMinor,
		"currency":    currency,
	})
}

func (s *Server) listOrders(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	role := userRoleFromContext(r.Context())

	var query string
	args := make([]any, 0, 1)

	if role == "admin" {
		query = `
		SELECT
			id,
			status,
			total_minor,
			currency,
			shipping_address,
			comment,
			customer_email,
			customer_phone,
			created_at,
			updated_at
		FROM orders
		ORDER BY id DESC
		`
	} else {
		query = `
		SELECT
			id,
			status,
			total_minor,
			currency,
			shipping_address,
			comment,
			customer_email,
			customer_phone,
			created_at,
			updated_at
		FROM orders
		WHERE user_id = $1
		ORDER BY id DESC
		`
		args = append(args, userID)
	}

	rows, err := s.db.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("failed to query orders", "user_id", userID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load orders")
		return
	}
	defer rows.Close()

	orders := make([]models.Order, 0, 16)

	for rows.Next() {
		var order models.Order
		if err := rows.Scan(
			&order.ID,
			&order.Status,
			&order.TotalMinor,
			&order.Currency,
			&order.ShippingAddress,
			&order.Comment,
			&order.CustomerEmail,
			&order.CustomerPhone,
			&order.CreatedAt,
			&order.UpdatedAt,
		); err != nil {
			slog.Error("failed to scan order", "user_id", userID, "error", err)
			writeError(w, http.StatusInternalServerError, "failed to load orders")
			return
		}
		orders = append(orders, order)
	}

	if err := rows.Err(); err != nil {
		slog.Error("order rows error", "user_id", userID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load orders")
		return
	}

	writeJSON(w, http.StatusOK, orders)
}

func (s *Server) getOrder(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	orderID, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid order id")
		return
	}

	role := userRoleFromContext(r.Context())

	var query string
	args := []any{orderID}

	if role == "admin" {
		query = `
		SELECT
			id,
			status,
			total_minor,
			currency,
			shipping_address,
			comment,
			customer_email,
			customer_phone,
			created_at,
			updated_at
		FROM orders
		WHERE id = $1
		`
	} else {
		query = `
		SELECT
			id,
			status,
			total_minor,
			currency,
			shipping_address,
			comment,
			customer_email,
			customer_phone,
			created_at,
			updated_at
		FROM orders
		WHERE id = $1 AND user_id = $2
		`
		args = append(args, userID)
	}

	var order models.Order
	err = s.db.QueryRow(r.Context(), query, args...).Scan(
		&order.ID,
		&order.Status,
		&order.TotalMinor,
		&order.Currency,
		&order.ShippingAddress,
		&order.Comment,
		&order.CustomerEmail,
		&order.CustomerPhone,
		&order.CreatedAt,
		&order.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "order not found")
			return
		}

		slog.Error("failed to get order", "order_id", orderID, "user_id", userID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load order")
		return
	}

	itemRows, err := s.db.Query(
		r.Context(),
		`
		SELECT
			id,
			product_id,
			name,
			sku,
			quantity,
			price_minor
		FROM order_items
		WHERE order_id = $1
		ORDER BY id
		`,
		order.ID,
	)
	if err != nil {
		slog.Error("failed to query order items", "order_id", order.ID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load order items")
		return
	}
	defer itemRows.Close()

	items := make([]models.OrderItem, 0, 16)

	for itemRows.Next() {
		var item models.OrderItem
		if err := itemRows.Scan(
			&item.ID,
			&item.ProductID,
			&item.Name,
			&item.SKU,
			&item.Quantity,
			&item.PriceMinor,
		); err != nil {
			slog.Error("failed to scan order item", "order_id", order.ID, "error", err)
			writeError(w, http.StatusInternalServerError, "failed to load order items")
			return
		}
		items = append(items, item)
	}

	if err := itemRows.Err(); err != nil {
		slog.Error("order item rows error", "order_id", order.ID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load order items")
		return
	}

	order.Items = items

	writeJSON(w, http.StatusOK, order)
}