package apihttp

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type adminUserResponse struct {
	ID        int64     `json:"id"`
	Email     string    `json:"email"`
	FullName  *string   `json:"full_name,omitempty"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (s *Server) adminListUsers(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	limit, err := strconv.Atoi(q.Get("limit"))
	if err != nil || limit <= 0 || limit > 200 {
		limit = 50
	}

	offset, err := strconv.Atoi(q.Get("offset"))
	if err != nil || offset < 0 {
		offset = 0
	}

	args := []any{}
	conditions := []string{}

	if search := strings.TrimSpace(q.Get("search")); search != "" {
		escaped := strings.NewReplacer("%", `\%`, "_", `\_`).Replace(search)
		pattern := "%" + escaped + "%"

		args = append(args, pattern)
		n := len(args)

		conditions = append(
			conditions,
			fmt.Sprintf("(email ILIKE $%d OR full_name ILIKE $%d)", n, n),
		)
	}

	args = append(args, limit, offset)
	limitIndex := len(args) - 1
	offsetIndex := len(args)

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	query := fmt.Sprintf(
		`
		SELECT
			id,
			email,
			full_name,
			role,
			created_at,
			updated_at
		FROM users
		%s
		ORDER BY id DESC
		LIMIT $%d OFFSET $%d
		`,
		whereClause,
		limitIndex,
		offsetIndex,
	)

	rows, err := s.db.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("failed to query admin users", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load users")
		return
	}
	defer rows.Close()

	users := make([]adminUserResponse, 0, limit)

	for rows.Next() {
		var user adminUserResponse

		if err := rows.Scan(
			&user.ID,
			&user.Email,
			&user.FullName,
			&user.Role,
			&user.CreatedAt,
			&user.UpdatedAt,
		); err != nil {
			slog.Error("failed to scan admin user", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to load users")
			return
		}

		users = append(users, user)
	}

	if err := rows.Err(); err != nil {
		slog.Error("admin user rows error", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load users")
		return
	}

	writeJSON(w, http.StatusOK, users)
}

func (s *Server) adminGetUser(w http.ResponseWriter, r *http.Request) {
	userID, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	var user adminUserResponse

	err = s.db.QueryRow(
		r.Context(),
		`
		SELECT
			id,
			email,
			full_name,
			role,
			created_at,
			updated_at
		FROM users
		WHERE id = $1
		`,
		userID,
	).Scan(
		&user.ID,
		&user.Email,
		&user.FullName,
		&user.Role,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}

		slog.Error("failed to get admin user", "user_id", userID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load user")
		return
	}

	writeJSON(w, http.StatusOK, user)
}