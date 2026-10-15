package apihttp

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/example/radio-store/backend/internal/models"
)

type adminBlogPostRequest struct {
	Slug        string  `json:"slug"`
	Title       string  `json:"title"`
	Excerpt     *string `json:"excerpt"`
	Body        string  `json:"body"`
	Author      *string `json:"author"`
	IsPublished bool    `json:"is_published"`
}

var blogImageNameRegexp = productImageNameRegexp // тот же формат имени: 32 hex + расширение

func (s *Server) blogImagesDir() string {
	return filepath.Join(s.uploadDir, "blog")
}

func (s *Server) removeBlogImageFileByURL(url string) {
	base := filepath.Base(url)

	if !blogImageNameRegexp.MatchString(base) {
		return
	}

	path := filepath.Join(s.blogImagesDir(), base)

	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		slog.Error("failed to remove blog cover file", "path", path, "error", err)
	}
}

// adminListBlogPosts возвращает все статьи (включая черновики) для админки.
// GET /api/v1/admin/blog/posts
func (s *Server) adminListBlogPosts(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(
		r.Context(),
		`SELECT `+blogPostColumns+`
		 FROM blog_posts
		 ORDER BY id DESC`,
	)
	if err != nil {
		slog.Error("failed to query admin blog posts", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load blog posts")
		return
	}
	defer rows.Close()

	posts := make([]models.BlogPost, 0, 32)

	for rows.Next() {
		post, err := scanBlogPost(rows)
		if err != nil {
			slog.Error("failed to scan admin blog post", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to load blog posts")
			return
		}
		posts = append(posts, post)
	}

	if err := rows.Err(); err != nil {
		slog.Error("admin blog post rows error", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load blog posts")
		return
	}

	writeJSON(w, http.StatusOK, posts)
}

// adminCreateBlogPost создаёт статью (черновик или сразу опубликованную).
// POST /api/v1/admin/blog/posts
func (s *Server) adminCreateBlogPost(w http.ResponseWriter, r *http.Request) {
	var req adminBlogPostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	slug := strings.TrimSpace(req.Slug)
	title := strings.TrimSpace(req.Title)
	body := strings.TrimSpace(req.Body)

	if slug == "" || title == "" || body == "" {
		writeError(w, http.StatusBadRequest, "slug, title and body are required")
		return
	}

	var publishedAt *time.Time
	if req.IsPublished {
		now := time.Now()
		publishedAt = &now
	}

	post, err := scanBlogPost(s.db.QueryRow(
		r.Context(),
		`INSERT INTO blog_posts (
			slug, title, excerpt, body, author, is_published, published_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING `+blogPostColumns,
		slug,
		title,
		nullIfEmpty(req.Excerpt),
		body,
		nullIfEmpty(req.Author),
		req.IsPublished,
		publishedAt,
	))
	if err != nil {
		if isPgErrorCode(err, "23505") {
			writeError(w, http.StatusConflict, "post with this slug already exists")
			return
		}

		slog.Error("failed to create blog post", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create blog post")
		return
	}

	writeJSON(w, http.StatusCreated, post)
}

// adminUpdateBlogPost обновляет метаданные и тело статьи.
// PATCH /api/v1/admin/blog/posts/{id}
func (s *Server) adminUpdateBlogPost(w http.ResponseWriter, r *http.Request) {
	postID, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid post id")
		return
	}

	var req adminBlogPostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	slug := strings.TrimSpace(req.Slug)
	title := strings.TrimSpace(req.Title)
	body := strings.TrimSpace(req.Body)

	if slug == "" || title == "" || body == "" {
		writeError(w, http.StatusBadRequest, "slug, title and body are required")
		return
	}

	post, err := scanBlogPost(s.db.QueryRow(
		r.Context(),
		`UPDATE blog_posts
		 SET
			slug = $2,
			title = $3,
			excerpt = $4,
			body = $5,
			author = $6,
			is_published = $7,
			published_at = CASE
				WHEN $7 = TRUE  AND published_at IS NULL THEN now()
				WHEN $7 = FALSE THEN NULL
				ELSE published_at
			END,
			updated_at = now()
		 WHERE id = $1
		 RETURNING `+blogPostColumns,
		postID,
		slug,
		title,
		nullIfEmpty(req.Excerpt),
		body,
		nullIfEmpty(req.Author),
		req.IsPublished,
	))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "post not found")
			return
		}
		if isPgErrorCode(err, "23505") {
			writeError(w, http.StatusConflict, "post with this slug already exists")
			return
		}

		slog.Error("failed to update blog post", "post_id", postID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update blog post")
		return
	}

	writeJSON(w, http.StatusOK, post)
}

// adminDeleteBlogPost удаляет статью и её обложку с диска.
// DELETE /api/v1/admin/blog/posts/{id}
func (s *Server) adminDeleteBlogPost(w http.ResponseWriter, r *http.Request) {
	postID, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid post id")
		return
	}

	var coverURL *string
	err = s.db.QueryRow(
		r.Context(),
		`DELETE FROM blog_posts WHERE id = $1 RETURNING cover_image_url`,
		postID,
	).Scan(&coverURL)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "post not found")
			return
		}

		slog.Error("failed to delete blog post", "post_id", postID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete blog post")
		return
	}

	if coverURL != nil {
		s.removeBlogImageFileByURL(*coverURL)
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "post deleted"})
}

// adminUploadBlogCover загружает/заменяет обложку статьи.
// POST /api/v1/admin/blog/posts/{id}/cover  (multipart, поле file)
func (s *Server) adminUploadBlogCover(w http.ResponseWriter, r *http.Request) {
	postID, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid post id")
		return
	}

	if err := r.ParseMultipartForm(8 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}
	defer r.MultipartForm.RemoveAll()

	file, header, err := r.FormFile("file")
	if err != nil {
		if errors.Is(err, http.ErrMissingFile) {
			writeError(w, http.StatusBadRequest, "file field is required")
			return
		}

		writeError(w, http.StatusBadRequest, "invalid file field")
		return
	}
	defer file.Close()

	if header.Size <= 0 || header.Size > maxProductImageSize {
		writeError(w, http.StatusRequestEntityTooLarge, "file is empty or exceeds 5 MiB limit")
		return
	}

	data, err := io.ReadAll(file)
	if err != nil {
		slog.Error("failed to read blog cover", "post_id", postID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to read uploaded file")
		return
	}

	ext, ok := detectImageExtension(data)
	if !ok {
		writeError(w, http.StatusUnsupportedMediaType, "only jpeg, png, webp and gif images are allowed")
		return
	}

	name, err := generateImageFileName(ext)
	if err != nil {
		slog.Error("failed to generate blog cover name", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to process image")
		return
	}

	dir := s.blogImagesDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		slog.Error("failed to create blog dir", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to store image")
		return
	}

	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		slog.Error("failed to write blog cover", "path", path, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to store image")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		slog.Error("failed to begin tx", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to save cover")
		return
	}
	defer tx.Rollback(r.Context())

	var oldCover *string
	err = tx.QueryRow(
		r.Context(),
		`SELECT cover_image_url FROM blog_posts WHERE id = $1 FOR UPDATE`,
		postID,
	).Scan(&oldCover)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			s.removeBlogImageFileByURL("/media/blog/" + name)
			writeError(w, http.StatusNotFound, "post not found")
			return
		}

		slog.Error("failed to lock blog post for cover", "post_id", postID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to save cover")
		return
	}

	newURL := "/media/blog/" + name

	post, err := scanBlogPost(tx.QueryRow(
		r.Context(),
		`UPDATE blog_posts SET cover_image_url = $2, updated_at = now() WHERE id = $1 RETURNING `+blogPostColumns,
		postID,
		newURL,
	))
	if err != nil {
		slog.Error("failed to update blog cover", "post_id", postID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to save cover")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("failed to commit cover", "post_id", postID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to save cover")
		return
	}

	// Старую обложку удаляем с диска только после успешного коммита.
	if oldCover != nil {
		s.removeBlogImageFileByURL(*oldCover)
	}

	writeJSON(w, http.StatusOK, post)
}

// serveBlogImage отдаёт обложку статьи. Листинг директорий невозможен,
// имя файла строго валидируется регуляркой.
// GET /media/blog/{filename}
func (s *Server) serveBlogImage(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("filename")

	if !blogImageNameRegexp.MatchString(name) {
		http.NotFound(w, r)
		return
	}

	path := filepath.Join(s.blogImagesDir(), name)

	f, err := os.Open(path)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil || stat.IsDir() {
		http.NotFound(w, r)
		return
	}

	ext := filepath.Ext(name)
	if ct, ok := productImageContentTypes[ext]; ok {
		w.Header().Set("Content-Type", ct)
	}

	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")

	http.ServeContent(w, r, name, stat.ModTime(), f)
}