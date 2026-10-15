package apihttp

import (
	"log/slog"
	"net/http"
)

type adminNewOrdersCountResponse struct {
	Count int `json:"count"`
}

func (s *Server) adminNewOrdersCount(w http.ResponseWriter, r *http.Request) {
	var count int

	err := s.db.QueryRow(
		r.Context(),
		`SELECT COUNT(*) FROM orders WHERE status = 'new'`,
	).Scan(&count)

	if err != nil {
		slog.Error("failed to count new orders", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to count new orders")
		return
	}

	writeJSON(w, http.StatusOK, adminNewOrdersCountResponse{Count: count})
}