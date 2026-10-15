package apihttp

import (
	"log/slog"
	"net/http"
	"runtime/debug"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/example/radio-store/backend/internal/config"
)

type Server struct {
	db        *pgxpool.Pool
	jwtSecret string
	uploadDir string
	smtp      config.SMTPConfig
}

func New(db *pgxpool.Pool, jwtSecret string, uploadDir string, smtpCfg config.SMTPConfig) http.Handler {
	s := &Server{
		db:        db,
		jwtSecret: jwtSecret,
		uploadDir: uploadDir,
		smtp:      smtpCfg,
	}

	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", s.health)

	mux.HandleFunc("GET /robots.txt", s.robotsTxt)
	mux.HandleFunc("GET /sitemap.xml", s.sitemapXML)

	mux.HandleFunc("GET /media/products/{filename}", s.serveProductImage)

	mux.HandleFunc("GET /api/v1/categories", s.listCategories)
	mux.HandleFunc("GET /api/v1/products", s.listProducts)
	mux.HandleFunc("GET /api/v1/products/images", s.productImagesBatch)
	mux.HandleFunc("GET /api/v1/products/{id}", s.getProduct)

	mux.HandleFunc("POST /api/v1/auth/register", s.register)
	mux.HandleFunc("POST /api/v1/auth/login", s.login)
	mux.HandleFunc("GET /api/v1/auth/me", s.authMiddleware(s.me))

	mux.HandleFunc("GET /api/v1/cart", s.authMiddleware(s.getCart))
	mux.HandleFunc("POST /api/v1/cart/items", s.authMiddleware(s.addCartItem))
	mux.HandleFunc("PATCH /api/v1/cart/items/{product_id}", s.authMiddleware(s.updateCartItem))
	mux.HandleFunc("DELETE /api/v1/cart/items/{product_id}", s.authMiddleware(s.deleteCartItem))

	mux.HandleFunc("POST /api/v1/orders", s.authMiddleware(s.createOrder))
	mux.HandleFunc("GET /api/v1/orders", s.authMiddleware(s.listOrders))
	mux.HandleFunc("GET /api/v1/orders/{id}", s.authMiddleware(s.getOrder))

	mux.HandleFunc("GET /api/v1/admin/products", s.adminMiddleware(s.adminListProducts))
	mux.HandleFunc("POST /api/v1/admin/products", s.adminMiddleware(s.adminCreateProduct))
	mux.HandleFunc("PATCH /api/v1/admin/products/{id}", s.adminMiddleware(s.adminUpdateProduct))
	mux.HandleFunc("PATCH /api/v1/admin/products/{id}/stock", s.adminMiddleware(s.adminSetStock))

	mux.HandleFunc("GET /api/v1/admin/products/{id}/images", s.adminMiddleware(s.adminListProductImages))
	mux.HandleFunc("POST /api/v1/admin/products/{id}/images", s.adminMiddleware(s.adminUploadProductImage))
	mux.HandleFunc("DELETE /api/v1/admin/products/{id}/images/{imageId}", s.adminMiddleware(s.adminDeleteProductImage))
	mux.HandleFunc("PATCH /api/v1/admin/products/{id}/images/{imageId}/primary", s.adminMiddleware(s.adminSetPrimaryProductImage))

	mux.HandleFunc("GET /api/v1/admin/categories", s.adminMiddleware(s.adminListCategories))
	mux.HandleFunc("POST /api/v1/admin/categories", s.adminMiddleware(s.adminCreateCategory))
	mux.HandleFunc("PATCH /api/v1/admin/categories/{id}", s.adminMiddleware(s.adminUpdateCategory))
	mux.HandleFunc("DELETE /api/v1/admin/categories/{id}", s.adminMiddleware(s.adminDeleteCategory))

	mux.HandleFunc("GET /api/v1/admin/orders", s.adminMiddleware(s.listOrders))
	mux.HandleFunc("GET /api/v1/admin/orders/new-count", s.adminMiddleware(s.adminNewOrdersCount))
	mux.HandleFunc("GET /api/v1/admin/orders/contacts", s.adminMiddleware(s.adminOrdersContacts))
	mux.HandleFunc("PATCH /api/v1/admin/orders/{id}/status", s.adminMiddleware(s.adminUpdateOrderStatus))

	mux.HandleFunc("POST /api/v1/admin/orders/{id}/invoices", s.adminMiddleware(s.adminCreateInvoice))
	mux.HandleFunc("GET /api/v1/admin/invoices", s.adminMiddleware(s.adminListInvoices))
	mux.HandleFunc("POST /api/v1/admin/invoices/{id}/send", s.adminMiddleware(s.adminSendInvoice))
	mux.HandleFunc("GET /api/v1/admin/invoices/{id}/view", s.adminMiddleware(s.adminRenderInvoice))

	mux.HandleFunc("GET /api/v1/admin/users", s.adminMiddleware(s.adminListUsers))
	mux.HandleFunc("GET /api/v1/admin/users/{id}", s.adminMiddleware(s.adminGetUser))

	return withCORS(withLogging(withRecover(mux)))
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		} else {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}

		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		slog.Info(
			"request",
			"method", r.Method,
			"path", r.URL.Path,
			"duration", time.Since(start).String(),
		)
	})
}

func withRecover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error(
					"panic recovered",
					"panic", rec,
					"stack", string(debug.Stack()),
				)
				writeError(w, http.StatusInternalServerError, "internal server error")
			}
		}()

		next.ServeHTTP(w, r)
	})
}