package apihttp

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"

	"github.com/example/radio-store/backend/internal/models"
)

const blogPostColumns = `
	id,
	slug,
	title,
	excerpt,
	body,
	cover_image_url,
	author,
	is_published,
	published_at,
	created_at,
	updated_at,
	views_count,
	likes_count
`

func scanBlogPost(row interface{ Scan(...any) error }) (models.BlogPost, error) {
	var post models.BlogPost
	err := row.Scan(
		&post.ID,
		&post.Slug,
		&post.Title,
		&post.Excerpt,
		&post.Body,
		&post.CoverImageURL,
		&post.Author,
		&post.IsPublished,
		&post.PublishedAt,
		&post.CreatedAt,
		&post.UpdatedAt,
		&post.ViewsCount,
		&post.LikesCount,
	)
	return post, err
}

// listBlogPosts возвращает опубликованные статьи для витрины.
// GET /api/v1/blog/posts?limit=20&offset=0
func (s *Server) listBlogPosts(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	limit, err := strconv.Atoi(q.Get("limit"))
	if err != nil || limit <= 0 || limit > 100 {
		limit = 20
	}

	offset, err := strconv.Atoi(q.Get("offset"))
	if err != nil || offset < 0 {
		offset = 0
	}

	rows, err := s.db.Query(
		r.Context(),
		`SELECT `+blogPostColumns+`
		 FROM blog_posts
		 WHERE is_published = TRUE
		 ORDER BY published_at DESC NULLS LAST, id DESC
		 LIMIT $1 OFFSET $2`,
		limit,
		offset,
	)
	if err != nil {
		slog.Error("failed to query blog posts", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load blog posts")
		return
	}
	defer rows.Close()

	posts := make([]models.BlogPost, 0, limit)

	for rows.Next() {
		post, err := scanBlogPost(rows)
		if err != nil {
			slog.Error("failed to scan blog post", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to load blog posts")
			return
		}
		posts = append(posts, post)
	}

	if err := rows.Err(); err != nil {
		slog.Error("blog post rows error", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load blog posts")
		return
	}

	writeJSON(w, http.StatusOK, posts)
}

// getBlogPostBySlug возвращает одну опубликованную статью по slug.
// GET /api/v1/blog/posts/{slug}
func (s *Server) getBlogPostBySlug(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	if slug == "" {
		writeError(w, http.StatusBadRequest, "invalid slug")
		return
	}

	post, err := scanBlogPost(s.db.QueryRow(
		r.Context(),
		`SELECT `+blogPostColumns+`
		 FROM blog_posts
		 WHERE slug = $1 AND is_published = TRUE`,
		slug,
	))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "post not found")
			return
		}

		slog.Error("failed to get blog post", "slug", slug, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load blog post")
		return
	}

	writeJSON(w, http.StatusOK, post)
}