package apihttp

import (
	"log/slog"
	"net/http"
	"strconv"
	"strings"
)

type productPrimaryImageResponse struct {
	ProductID       int64  `json:"product_id"`
	PrimaryImageURL string `json:"primary_image_url"`
}

const maxProductImageBatchIDs = 200

// productImagesBatch возвращает главное фото для списка товаров по их id.
// Используется витриной, чтобы показать актуальные изображения в корзине и
// в составе заказа, не раздувая сами объекты OrderItem/CartItem.
//
// GET /api/v1/products/images?ids=1,2,3
func (s *Server) productImagesBatch(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimSpace(r.URL.Query().Get("ids"))
	if raw == "" {
		writeJSON(w, http.StatusOK, []productPrimaryImageResponse{})
		return
	}

	parts := strings.Split(raw, ",")
	if len(parts) > maxProductImageBatchIDs {
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
		writeJSON(w, http.StatusOK, []productPrimaryImageResponse{})
		return
	}

	rows, err := s.db.Query(
		r.Context(),
		`
		SELECT DISTINCT ON (product_id) product_id, url
		FROM product_images
		WHERE product_id = ANY($1)
		ORDER BY product_id, is_primary DESC, position ASC, id ASC
		`,
		ids,
	)
	if err != nil {
		slog.Error("failed to query product images batch", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load product images")
		return
	}
	defer rows.Close()

	images := make([]productPrimaryImageResponse, 0, len(ids))

	for rows.Next() {
		var item productPrimaryImageResponse
		if err := rows.Scan(&item.ProductID, &item.PrimaryImageURL); err != nil {
			slog.Error("failed to scan product image batch row", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to load product images")
			return
		}

		images = append(images, item)
	}

	if err := rows.Err(); err != nil {
		slog.Error("product image batch rows error", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load product images")
		return
	}

	writeJSON(w, http.StatusOK, images)
}