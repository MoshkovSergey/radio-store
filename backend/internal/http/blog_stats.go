package apihttp

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
)

const blogVisitorTokenMaxLen = 128

type blogLikeRequest struct {
	VisitorToken string `json:"visitor_token"`
}

type blogEngagementResponse struct {
	ViewsCount int64 `json:"views_count"`
	LikesCount int64 `json:"likes_count"`
	Liked      bool  `json:"liked"`
}

type blogViewResponse struct {
	ViewsCount int64 `json:"views_count"`
	LikesCount int64 `json:"likes_count"`
}

type blogLikeResponse struct {
	Liked      bool  `json:"liked"`
	ViewsCount int64 `json:"views_count"`
	LikesCount int64 `json:"likes_count"`
}

func (s *Server) publishedBlogPostIDBySlug(ctx context.Context, slug string) (int64, error) {
	var id int64

	err := s.db.QueryRow(
		ctx,
		`SELECT id
		 FROM blog_posts
		 WHERE slug = $1 AND is_published = TRUE`,
		slug,
	).Scan(&id)

	if err != nil {
		return 0, err
	}

	return id, nil
}

// getBlogPostEngagement возвращает счётчики и статус лайка для конкретного visitor_token.
// GET /api/v1/blog/posts/{slug}/engagement?visitor_token=...
func (s *Server) getBlogPostEngagement(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	if slug == "" {
		writeError(w, http.StatusBadRequest, "invalid slug")
		return
	}

	visitorToken := strings.TrimSpace(r.URL.Query().Get("visitor_token"))
	if len(visitorToken) > blogVisitorTokenMaxLen {
		writeError(w, http.StatusBadRequest, "invalid visitor token")
		return
	}

	ctx := r.Context()

	postID, err := s.publishedBlogPostIDBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "post not found")
			return
		}

		slog.Error("failed to get blog post for engagement", "slug", slug, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load engagement")
		return
	}

	var viewsCount int64
	var likesCount int64

	err = s.db.QueryRow(
		ctx,
		`SELECT views_count, likes_count
		 FROM blog_posts
		 WHERE id = $1`,
		postID,
	).Scan(&viewsCount, &likesCount)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "post not found")
			return
		}

		slog.Error("failed to load blog post counters", "post_id", postID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load engagement")
		return
	}

	liked := false

	if visitorToken != "" {
		err = s.db.QueryRow(
			ctx,
			`SELECT EXISTS (
				SELECT 1
				FROM blog_post_likes
				WHERE post_id = $1 AND visitor_token = $2
			)`,
			postID,
			visitorToken,
		).Scan(&liked)

		if err != nil {
			slog.Error("failed to load blog post like status", "post_id", postID, "error", err)
			writeError(w, http.StatusInternalServerError, "failed to load engagement")
			return
		}
	}

	writeJSON(w, http.StatusOK, blogEngagementResponse{
		ViewsCount: viewsCount,
		LikesCount: likesCount,
		Liked:      liked,
	})
}

// incrementBlogPostView увеличивает счётчик просмотров опубликованной статьи.
// POST /api/v1/blog/posts/{slug}/view
func (s *Server) incrementBlogPostView(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	if slug == "" {
		writeError(w, http.StatusBadRequest, "invalid slug")
		return
	}

	ctx := r.Context()

	postID, err := s.publishedBlogPostIDBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "post not found")
			return
		}

		slog.Error("failed to get blog post for view", "slug", slug, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to register view")
		return
	}

	var viewsCount int64
	var likesCount int64

	err = s.db.QueryRow(
		ctx,
		`UPDATE blog_posts
		 SET views_count = views_count + 1
		 WHERE id = $1
		 RETURNING views_count, likes_count`,
		postID,
	).Scan(&viewsCount, &likesCount)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "post not found")
			return
		}

		slog.Error("failed to increment blog post view", "post_id", postID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to register view")
		return
	}

	writeJSON(w, http.StatusOK, blogViewResponse{
		ViewsCount: viewsCount,
		LikesCount: likesCount,
	})
}

// toggleBlogPostLike ставит или убирает лайк для visitor_token.
// POST /api/v1/blog/posts/{slug}/like
func (s *Server) toggleBlogPostLike(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	if slug == "" {
		writeError(w, http.StatusBadRequest, "invalid slug")
		return
	}

	var req blogLikeRequest

	decoder := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	if err := decoder.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	visitorToken := strings.TrimSpace(req.VisitorToken)
	if visitorToken == "" || len(visitorToken) > blogVisitorTokenMaxLen {
		writeError(w, http.StatusBadRequest, "invalid visitor token")
		return
	}

	ctx := r.Context()

	postID, err := s.publishedBlogPostIDBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "post not found")
			return
		}

		slog.Error("failed to get blog post for like", "slug", slug, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to process like")
		return
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		slog.Error("failed to begin like transaction", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to process like")
		return
	}

	defer func() {
		_ = tx.Rollback(ctx)
	}()

	var deletedID int64

	liked := true

	err = tx.QueryRow(
		ctx,
		`DELETE FROM blog_post_likes
		 WHERE post_id = $1 AND visitor_token = $2
		 RETURNING id`,
		postID,
		visitorToken,
	).Scan(&deletedID)

	switch {
	case err == nil:
		liked = false

	case errors.Is(err, pgx.ErrNoRows):
		var insertedID int64

		err = tx.QueryRow(
			ctx,
			`INSERT INTO blog_post_likes (post_id, visitor_token)
			 VALUES ($1, $2)
			 ON CONFLICT (post_id, visitor_token) DO NOTHING
			 RETURNING id`,
			postID,
			visitorToken,
		).Scan(&insertedID)

		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			slog.Error("failed to insert blog post like", "post_id", postID, "error", err)
			writeError(w, http.StatusInternalServerError, "failed to process like")
			return
		}

		liked = true

	default:
		slog.Error("failed to delete blog post like", "post_id", postID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to process like")
		return
	}

	var viewsCount int64
	var likesCount int64

	err = tx.QueryRow(
		ctx,
		`UPDATE blog_posts
		 SET likes_count = (
			SELECT COUNT(*)
			FROM blog_post_likes
			WHERE post_id = $1
		 )
		 WHERE id = $1
		 RETURNING views_count, likes_count`,
		postID,
	).Scan(&viewsCount, &likesCount)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "post not found")
			return
		}

		slog.Error("failed to recompute blog post likes count", "post_id", postID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to process like")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		slog.Error("failed to commit like transaction", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to process like")
		return
	}

	writeJSON(w, http.StatusOK, blogLikeResponse{
		Liked:      liked,
		ViewsCount: viewsCount,
		LikesCount: likesCount,
	})
}

// RegisterBlogStatsRoutes регистрирует маршруты статистики блога.
// Этот метод нужно вызвать из server.go после создания mux.
func (s *Server) RegisterBlogStatsRoutes(mux *http.ServeMux) {
	mux.HandleFunc(
		"GET /api/v1/blog/posts/{slug}/engagement",
		s.getBlogPostEngagement,
	)

	mux.HandleFunc(
		"POST /api/v1/blog/posts/{slug}/view",
		s.incrementBlogPostView,
	)

	mux.HandleFunc(
		"POST /api/v1/blog/posts/{slug}/like",
		s.toggleBlogPostLike,
	)
}