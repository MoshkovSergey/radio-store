package apihttp

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

const maxProductImageSize = 5 << 20 // 5 MiB

type productImageResponse struct {
	ID        int64   `json:"id"`
	URL       string  `json:"url"`
	Alt       *string `json:"alt,omitempty"`
	Position  int     `json:"position"`
	IsPrimary bool    `json:"is_primary"`
}

func generateImageFileName(ext string) (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf) + ext, nil
}

func detectImageExtension(data []byte) (string, bool) {
	ct := http.DetectContentType(data)

	switch ct {
	case "image/jpeg":
		return ".jpg", true
	case "image/png":
		return ".png", true
	case "image/webp":
		return ".webp", true
	case "image/gif":
		return ".gif", true
	default:
		return "", false
	}
}

func (s *Server) productImagesDir() string {
	return filepath.Join(s.uploadDir, "products")
}

func (s *Server) removeImageFileByURL(url string) {
	base := filepath.Base(url)

	if !productImageNameRegexp.MatchString(base) {
		return
	}

	path := filepath.Join(s.productImagesDir(), base)

	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		slog.Error("failed to remove image file", "path", path, "error", err)
	}
}

func (s *Server) adminListProductImages(w http.ResponseWriter, r *http.Request) {
	productID, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid product id")
		return
	}

	rows, err := s.db.Query(
		r.Context(),
		`
		SELECT id, url, alt, position, is_primary
		FROM product_images
		WHERE product_id = $1
		ORDER BY is_primary DESC, position ASC, id ASC
		`,
		productID,
	)
	if err != nil {
		slog.Error("failed to query product images", "product_id", productID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load product images")
		return
	}
	defer rows.Close()

	images := make([]productImageResponse, 0, 8)

	for rows.Next() {
		var image productImageResponse
		if err := rows.Scan(&image.ID, &image.URL, &image.Alt, &image.Position, &image.IsPrimary); err != nil {
			slog.Error("failed to scan product image", "product_id", productID, "error", err)
			writeError(w, http.StatusInternalServerError, "failed to load product images")
			return
		}
		images = append(images, image)
	}

	if err := rows.Err(); err != nil {
		slog.Error("product image rows error", "product_id", productID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load product images")
		return
	}

	writeJSON(w, http.StatusOK, images)
}

func (s *Server) adminUploadProductImage(w http.ResponseWriter, r *http.Request) {
	productID, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid product id")
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
		slog.Error("failed to read uploaded file", "product_id", productID, "error", err)
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
		slog.Error("failed to generate image name", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to process image")
		return
	}

	dir := s.productImagesDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		slog.Error("failed to create products dir", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to store image")
		return
	}

	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		slog.Error("failed to write image file", "path", path, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to store image")
		return
	}

	alt := strings.TrimSpace(r.FormValue("alt"))
	var altPtr *string
	if alt != "" {
		altPtr = &alt
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		slog.Error("failed to begin transaction", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to save image")
		return
	}
	defer tx.Rollback(r.Context())

	var exists bool
	err = tx.QueryRow(r.Context(), `SELECT TRUE FROM products WHERE id = $1`, productID).Scan(&exists)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			s.removeImageFileByURL("/media/products/" + name)
			writeError(w, http.StatusNotFound, "product not found")
			return
		}

		slog.Error("failed to check product", "product_id", productID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to save image")
		return
	}

	var count int
	var maxPosition int
	err = tx.QueryRow(
		r.Context(),
		`SELECT COUNT(*), COALESCE(MAX(position), -1) FROM product_images WHERE product_id = $1`,
		productID,
	).Scan(&count, &maxPosition)
	if err != nil {
		slog.Error("failed to count product images", "product_id", productID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to save image")
		return
	}

	isPrimary := count == 0
	position := maxPosition + 1
	if isPrimary {
		position = 0
	}

	url := "/media/products/" + name

	var image productImageResponse
	err = tx.QueryRow(
		r.Context(),
		`
		INSERT INTO product_images (product_id, url, alt, position, is_primary)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, url, alt, position, is_primary
		`,
		productID,
		url,
		altPtr,
		position,
		isPrimary,
	).Scan(&image.ID, &image.URL, &image.Alt, &image.Position, &image.IsPrimary)
	if err != nil {
		slog.Error("failed to insert product image", "product_id", productID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to save image")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("failed to commit image insert", "product_id", productID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to save image")
		return
	}

	writeJSON(w, http.StatusCreated, image)
}

func (s *Server) adminDeleteProductImage(w http.ResponseWriter, r *http.Request) {
	productID, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid product id")
		return
	}

	imageID, err := parsePathID(r, "imageId")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid image id")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		slog.Error("failed to begin transaction", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete image")
		return
	}
	defer tx.Rollback(r.Context())

	var url string
	err = tx.QueryRow(
		r.Context(),
		`DELETE FROM product_images WHERE id = $1 AND product_id = $2 RETURNING url`,
		imageID,
		productID,
	).Scan(&url)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "image not found")
			return
		}

		slog.Error("failed to delete product image", "image_id", imageID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete image")
		return
	}

	// Если удалили главное фото — назначаем новым главным первое по порядку.
	_, err = tx.Exec(
		r.Context(),
		`
		UPDATE product_images
		SET is_primary = TRUE
		WHERE id = (
			SELECT id
			FROM product_images
			WHERE product_id = $1
			ORDER BY position ASC, id ASC
			LIMIT 1
		)
		`,
		productID,
	)
	if err != nil {
		slog.Error("failed to reassign primary image", "product_id", productID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete image")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("failed to commit image delete", "image_id", imageID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete image")
		return
	}

	s.removeImageFileByURL(url)

	writeJSON(w, http.StatusOK, map[string]string{"message": "image deleted"})
}

func (s *Server) adminSetPrimaryProductImage(w http.ResponseWriter, r *http.Request) {
	productID, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid product id")
		return
	}

	imageID, err := parsePathID(r, "imageId")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid image id")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		slog.Error("failed to begin transaction", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to set primary image")
		return
	}
	defer tx.Rollback(r.Context())

	var exists bool
	err = tx.QueryRow(
		r.Context(),
		`SELECT TRUE FROM product_images WHERE id = $1 AND product_id = $2`,
		imageID,
		productID,
	).Scan(&exists)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "image not found")
			return
		}

		slog.Error("failed to check image", "image_id", imageID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to set primary image")
		return
	}

	if _, err := tx.Exec(
		r.Context(),
		`UPDATE product_images SET is_primary = FALSE WHERE product_id = $1`,
		productID,
	); err != nil {
		slog.Error("failed to reset primary flags", "product_id", productID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to set primary image")
		return
	}

	var image productImageResponse
	err = tx.QueryRow(
		r.Context(),
		`
		UPDATE product_images
		SET is_primary = TRUE
		WHERE id = $1 AND product_id = $2
		RETURNING id, url, alt, position, is_primary
		`,
		imageID,
		productID,
	).Scan(&image.ID, &image.URL, &image.Alt, &image.Position, &image.IsPrimary)
	if err != nil {
		slog.Error("failed to set primary image", "image_id", imageID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to set primary image")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("failed to commit primary image", "image_id", imageID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to set primary image")
		return
	}

	writeJSON(w, http.StatusOK, image)
}

// parsePathID уже объявлен в cart.go; здесь он не переопределяется.
var _ = strconv.Itoa