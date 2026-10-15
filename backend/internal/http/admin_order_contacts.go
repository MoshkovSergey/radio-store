package apihttp

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

type orderContactResponse struct {
	OrderID       int64   `json:"order_id"`
	CustomerEmail *string `json:"customer_email,omitempty"`
	CustomerPhone *string `json:"customer_phone,omitempty"`
}

const maxOrderContactsBatch = 200

// adminOrdersContacts возвращает email/телефон для списка заказов по их id.
// Используется админкой, чтобы показать контакты рядом с адресом,
// не завися от того, выбирает ли listOrders эти колонки.
//
// GET /api/v1/admin/orders/contacts?ids=1,2,3
func (s *Server) adminOrdersContacts(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimSpace(r.URL.Query().Get("ids"))
	if raw == "" {
		writeJSON(w, http.StatusOK, []orderContactResponse{})
		return
	}

	parts := strings.Split(raw, ",")
	if len(parts) > maxOrderContactsBatch {
		writeError(w, http.StatusBadRequest, "too many ids")
		return
	}

	seen := make(map[int64]struct{}, len(parts))
	ids := make([]int64, 0, len(parts))

	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}

		id, err := strconv.ParseInt(part, 10, 64)
		if err != nil || id <= 0 {
			writeError(w, http.StatusBadRequest, "invalid id in list")
			return
		}

		if _, ok := seen[id]; ok {
			continue
		}

		seen[id] = struct{}{}
		ids = append(ids, id)
	}

	if len(ids) == 0 {
		writeJSON(w, http.StatusOK, []orderContactResponse{})
		return
	}

	rows, err := s.db.Query(
		r.Context(),
		`
		SELECT id, customer_email, customer_phone
		FROM orders
		WHERE id = ANY($1)
		`,
		ids,
	)
	if err != nil {
		// Миграция 0003 не применена -> колонок нет. Понятная ошибка вместо паники.
		slog.Error("failed to query order contacts", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load order contacts (apply migration 0003)")
		return
	}
	defer rows.Close()

	contacts := make([]orderContactResponse, 0, len(ids))

	for rows.Next() {
		var item orderContactResponse
		if err := rows.Scan(&item.OrderID, &item.CustomerEmail, &item.CustomerPhone); err != nil {
			slog.Error("failed to scan order contact", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to load order contacts")
			return
		}
		contacts = append(contacts, item)
	}

	if err := rows.Err(); err != nil {
		slog.Error("order contacts rows error", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load order contacts")
		return
	}

	writeJSON(w, http.StatusOK, contacts)
}

var _ = errors.Is
var _ = pgx.ErrNoRows