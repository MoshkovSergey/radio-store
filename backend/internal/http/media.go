package apihttp

import (
	"log/slog"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
)

var productImageNameRegexp = regexp.MustCompile(`^[a-f0-9]{32}\.(jpg|jpeg|png|webp|gif)$`)

var productImageContentTypes = map[string]string{
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".png":  "image/png",
	".webp": "image/webp",
	".gif":  "image/gif",
}

func (s *Server) serveProductImage(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("filename")

	if !productImageNameRegexp.MatchString(name) {
		http.NotFound(w, r)
		return
	}

	path := filepath.Join(s.uploadDir, "products", name)

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
	} else if detected := mime.TypeByExtension(ext); detected != "" {
		w.Header().Set("Content-Type", detected)
	}

	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")

	http.ServeContent(w, r, name, stat.ModTime(), f)

	if err != nil {
		slog.Error("failed to serve product image", "name", name, "error", err)
	}
}