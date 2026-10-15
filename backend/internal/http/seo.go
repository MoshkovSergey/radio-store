package apihttp

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type sitemapURL struct {
	Loc        string
	LastMod    time.Time
	Changefreq string
	Priority   string
}

func requestBaseURL(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}

	if forwardedProto := r.Header.Get("X-Forwarded-Proto"); forwardedProto != "" {
		parts := strings.Split(forwardedProto, ",")
		scheme = strings.TrimSpace(parts[0])
	}

	host := r.Host
	if host == "" {
		host = r.URL.Host
	}

	if forwardedHost := r.Header.Get("X-Forwarded-Host"); forwardedHost != "" {
		parts := strings.Split(forwardedHost, ",")
		host = strings.TrimSpace(parts[0])
	}

	if host == "" {
		host = "localhost"
	}

	return scheme + "://" + host
}

func escapeXML(value string) string {
	var buf bytes.Buffer

	if err := xml.EscapeText(&buf, []byte(value)); err != nil {
		return value
	}

	return buf.String()
}

func (s *Server) robotsTxt(w http.ResponseWriter, r *http.Request) {
	base := requestBaseURL(r)

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")

	_, err := fmt.Fprintf(
		w,
		`User-agent: *
Allow: /

Disallow: /api/
Disallow: /admin/
Disallow: /cart
Disallow: /login
Disallow: /orders
Disallow: /order/

Sitemap: %s/sitemap.xml
`,
		base,
	)
	if err != nil {
		slog.Error("failed to write robots.txt", "error", err)
	}
}

func (s *Server) sitemapXML(w http.ResponseWriter, r *http.Request) {
	base := requestBaseURL(r)
	now := time.Now().UTC()

	urls := make([]sitemapURL, 0, 128)

	urls = append(urls, sitemapURL{
		Loc:        base + "/",
		LastMod:    now,
		Changefreq: "daily",
		Priority:   "1.0",
	})

	urls = append(urls, sitemapURL{
		Loc:        base + "/catalog",
		LastMod:    now,
		Changefreq: "daily",
		Priority:   "0.9",
	})

	categoryRows, err := s.db.Query(
		r.Context(),
		`
		SELECT slug, created_at
		FROM categories
		ORDER BY slug
		`,
	)
	if err != nil {
		slog.Error("failed to query categories for sitemap", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to build sitemap")
		return
	}
	defer categoryRows.Close()

	for categoryRows.Next() {
		var slug string
		var createdAt time.Time

		if err := categoryRows.Scan(&slug, &createdAt); err != nil {
			slog.Error("failed to scan category for sitemap", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to build sitemap")
			return
		}

		urls = append(urls, sitemapURL{
			Loc:        base + "/category/" + escapeXML(slug),
			LastMod:    createdAt.UTC(),
			Changefreq: "weekly",
			Priority:   "0.8",
		})
	}

	if err := categoryRows.Err(); err != nil {
		slog.Error("category sitemap rows error", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to build sitemap")
		return
	}

	productRows, err := s.db.Query(
		r.Context(),
		`
		SELECT id, slug, updated_at
		FROM products
		WHERE is_active = TRUE
		ORDER BY id
		`,
	)
	if err != nil {
		slog.Error("failed to query products for sitemap", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to build sitemap")
		return
	}
	defer productRows.Close()

	for productRows.Next() {
		var id int64
		var slug string
		var updatedAt time.Time

		if err := productRows.Scan(&id, &slug, &updatedAt); err != nil {
			slog.Error("failed to scan product for sitemap", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to build sitemap")
			return
		}

		urls = append(urls, sitemapURL{
			Loc:        base + "/product/" + strconv.FormatInt(id, 10) + "-" + escapeXML(slug),
			LastMod:    updatedAt.UTC(),
			Changefreq: "daily",
			Priority:   "0.8",
		})
	}

	if err := productRows.Err(); err != nil {
		slog.Error("product sitemap rows error", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to build sitemap")
		return
	}

	var body strings.Builder

	body.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	body.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")

	for _, item := range urls {
		body.WriteString("<url>\n")
		body.WriteString("  <loc>");body.WriteString(escapeXML(item.Loc));body.WriteString("</loc>\n")
		body.WriteString("  <lastmod>");body.WriteString(item.LastMod.Format(time.RFC3339));body.WriteString("</lastmod>\n")
		body.WriteString("  <changefreq>");body.WriteString(escapeXML(item.Changefreq));body.WriteString("</changefreq>\n")
		body.WriteString("  <priority>");body.WriteString(escapeXML(item.Priority));body.WriteString("</priority>\n")
		body.WriteString("</url>\n")
	}

	body.WriteString("</urlset>\n")

	w.Header().Set("Content-Type", "application/xml; charset=utf-8")

	if _, err := w.Write([]byte(body.String())); err != nil {
		slog.Error("failed to write sitemap.xml", "error", err)
	}
}