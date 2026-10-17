package apihttp

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

const siteVisitVisitorTokenMaxLen = 128

type siteVisitRequest struct {
	VisitorToken string `json:"visitor_token"`
	PagePath     string `json:"page_path"`
	Referrer     string `json:"referrer"`
	UserAgent    string `json:"user_agent"`
}

type siteVisitResponse struct {
	OK bool `json:"ok"`
}

type siteVisitStatsRow struct {
	PagePath string `json:"page_path"`
	Visits   int64  `json:"visits"`
	Unique   int64  `json:"unique"`
}

type siteVisitStatsResponse struct {
	TotalVisits   int64                 `json:"total_visits"`
	TotalUnique   int64                 `json:"total_unique"`
	TopPages      []siteVisitStatsRow   `json:"top_pages"`
	VisitsByDay   []siteVisitDayStats   `json:"visits_by_day"`
}

type siteVisitDayStats struct {
	Date   string `json:"date"`
	Visits int64  `json:"visits"`
}

func hashUserAgent(ua string) string {
	if ua == "" {
		return ""
	}

	hash := sha256.Sum256([]byte(ua))
	return hex.EncodeToString(hash[:])
}

// recordSiteVisit регистрирует посещение страницы.
// POST /api/v1/visits
func (s *Server) recordSiteVisit(w http.ResponseWriter, r *http.Request) {
	var req siteVisitRequest

	decoder := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	if err := decoder.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	visitorToken := strings.TrimSpace(req.VisitorToken)
	pagePath := strings.TrimSpace(req.PagePath)

	if visitorToken == "" || len(visitorToken) > siteVisitVisitorTokenMaxLen {
		writeError(w, http.StatusBadRequest, "invalid visitor token")
		return
	}

	if pagePath == "" || len(pagePath) > 2048 {
		writeError(w, http.StatusBadRequest, "invalid page path")
		return
	}

	referrer := strings.TrimSpace(req.Referrer)
	if len(referrer) > 2048 {
		referrer = referrer[:2048]
	}

	userAgentHash := hashUserAgent(req.UserAgent)

	ctx := r.Context()

	_, err := s.db.Exec(
		ctx,
		`INSERT INTO site_visits (visitor_token, page_path, referrer, user_agent_hash, created_at)
		 VALUES ($1, $2, $3, $4, now())`,
		visitorToken,
		pagePath,
		referrer,
		userAgentHash,
	)

	if err != nil {
		slog.Error("failed to record site visit", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to record visit")
		return
	}

	writeJSON(w, http.StatusCreated, siteVisitResponse{OK: true})
}

// getSiteVisitStats возвращает статистику посещений для админки.
// GET /api/v1/admin/visits/stats?days=30
func (s *Server) getSiteVisitStats(w http.ResponseWriter, r *http.Request) {
	daysStr := r.URL.Query().Get("days")
	days := 30

	if daysStr != "" {
		var parsed int
		if _, err := sscanf(daysStr, "%d", &parsed); err == nil && parsed > 0 && parsed <= 365 {
			days = parsed
		}
	}

	ctx := r.Context()
	since := time.Now().AddDate(0, 0, -days)

	// Общее количество посещений
	var totalVisits int64
	err := s.db.QueryRow(
		ctx,
		`SELECT COUNT(*) FROM site_visits WHERE created_at >= $1`,
		since,
	).Scan(&totalVisits)

	if err != nil {
		slog.Error("failed to count site visits", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load stats")
		return
	}

	// Уникальные посетители
	var totalUnique int64
	err = s.db.QueryRow(
		ctx,
		`SELECT COUNT(DISTINCT visitor_token) FROM site_visits WHERE created_at >= $1`,
		since,
	).Scan(&totalUnique)

	if err != nil {
		slog.Error("failed to count unique visitors", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load stats")
		return
	}

	// Топ-10 страниц
	rows, err := s.db.Query(
		ctx,
		`SELECT 
			page_path,
			COUNT(*) AS visits,
			COUNT(DISTINCT visitor_token) AS unique_visitors
		 FROM site_visits
		 WHERE created_at >= $1
		 GROUP BY page_path
		 ORDER BY visits DESC
		 LIMIT 10`,
		since,
	)

	if err != nil {
		slog.Error("failed to query top pages", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load stats")
		return
	}
	defer rows.Close()

	topPages := make([]siteVisitStatsRow, 0, 10)

	for rows.Next() {
		var row siteVisitStatsRow
		if err := rows.Scan(&row.PagePath, &row.Visits, &row.Unique); err != nil {
			slog.Error("failed to scan top page", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to load stats")
			return
		}
		topPages = append(topPages, row)
	}

	if err := rows.Err(); err != nil {
		slog.Error("top pages rows error", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load stats")
		return
	}

	// Посещения по дням
	rows2, err := s.db.Query(
		ctx,
		`SELECT 
			DATE(created_at) AS day,
			COUNT(*) AS visits
		 FROM site_visits
		 WHERE created_at >= $1
		 GROUP BY DATE(created_at)
		 ORDER BY day DESC`,
		since,
	)

	if err != nil {
		slog.Error("failed to query visits by day", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load stats")
		return
	}
	defer rows2.Close()

	visitsByDay := make([]siteVisitDayStats, 0, days)

	for rows2.Next() {
		var day time.Time
		var visits int64

		if err := rows2.Scan(&day, &visits); err != nil {
			slog.Error("failed to scan day stats", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to load stats")
			return
		}

		visitsByDay = append(visitsByDay, siteVisitDayStats{
			Date:   day.Format("2006-01-02"),
			Visits: visits,
		})
	}

	if err := rows2.Err(); err != nil {
		slog.Error("visits by day rows error", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load stats")
		return
	}

	writeJSON(w, http.StatusOK, siteVisitStatsResponse{
		TotalVisits: totalVisits,
		TotalUnique: totalUnique,
		TopPages:    topPages,
		VisitsByDay: visitsByDay,
	})
}

// RegisterVisitsRoutes регистрирует маршруты счётчика посещений.
func (s *Server) RegisterVisitsRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/visits", s.recordSiteVisit)
	mux.HandleFunc("GET /api/v1/admin/visits/stats", s.adminMiddleware(s.getSiteVisitStats))
}

// sscanf — минимальная замена fmt.Sscanf для парсинга числа.
func sscanf(s, format string, args ...interface{}) (int, error) {
	if len(args) != 1 {
		return 0, errors.New("sscanf: expected 1 argument")
	}

	ptr, ok := args[0].(*int)
	if !ok {
		return 0, errors.New("sscanf: argument must be *int")
	}

	var n int
	_, err := fmt.Sscanf(s, format, ptr)
	if err != nil {
		return 0, err
	}

	return n, nil
}