package apihttp

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"html/template"
	"log/slog"
	"net"
	"net/http"
	"net/smtp"
	"net/textproto"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/example/radio-store/backend/internal/models"
)

const maxInvoiceOrderIDsBatch = 200

// ----- Реквизиты продавца (ЗАГЛУШКА: замени на реальные) -----
const (
	invoiceSellerName = "ООО «Radio Store»"
	invoiceSellerINN  = "0000000000"
	invoiceSellerKPP  = "000000001"
	invoiceSellerBank = "Банк: ____ , Р/с: ____ , К/с: ____ , БИК: ____"
	invoiceSellerAddr = "Юридический адрес: ____"
)

type invoiceLine struct {
	Name       string
	SKU        string
	Quantity   int
	PriceMinor int64
	Price      string
	Sum        string
}

type invoiceTemplateData struct {
	Number       string
	IssuedAt     string
	OrderID      int64
	SellerName   string
	SellerINN    string
	SellerKPP    string
	SellerBank   string
	SellerAddr   string
	CustomerName string
	CustomerEmail string
	CustomerPhone string
	CustomerAddr string
	Lines        []invoiceLine
	Total        string
	Currency     string
}

var invoiceTemplate = template.Must(template.New("invoice").Parse(`<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Счёт {{.Number}}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #101828; margin: 24px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .muted { color: #667085; font-size: 13px; }
  .row { display: flex; justify-content: space-between; gap: 24px; margin: 16px 0; }
  .box { border: 1px solid #e6eaf2; border-radius: 10px; padding: 14px; flex: 1; }
  .box h3 { margin: 0 0 8px; font-size: 14px; text-transform: uppercase; color: #475467; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #e6eaf2; padding: 8px 10px; text-align: left; font-size: 14px; }
  th { background: #f9fafb; }
  td.num, th.num { text-align: right; }
  .total { margin-top: 14px; text-align: right; font-size: 18px; font-weight: 700; }
  .actions { margin: 20px 0; }
  .actions button { padding: 10px 16px; font-size: 14px; border: 1px solid #0b5cff; background: #0b5cff; color: #fff; border-radius: 8px; cursor: pointer; }
  @media print { .actions { display: none; } body { margin: 0; } }
</style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">Печать / Сохранить в PDF</button></div>

  <h1>Счёт № {{.Number}}</h1>
  <div class="muted">от {{.IssuedAt}} · к заказу №{{.OrderID}}</div>

  <div class="row">
    <div class="box">
      <h3>Продавец</h3>
      <div><strong>{{.SellerName}}</strong></div>
      <div>ИНН {{.SellerINN}} · КПП {{.SellerKPP}}</div>
      <div class="muted">{{.SellerAddr}}</div>
      <div class="muted">{{.SellerBank}}</div>
    </div>
    <div class="box">
      <h3>Покупатель</h3>
      <div>{{.CustomerName}}</div>
      {{if .CustomerEmail}}<div>Email: {{.CustomerEmail}}</div>{{end}}
      {{if .CustomerPhone}}<div>Тел.: {{.CustomerPhone}}</div>{{end}}
      {{if .CustomerAddr}}<div class="muted">Адрес: {{.CustomerAddr}}</div>{{end}}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Наименование</th>
        <th>SKU</th>
        <th class="num">Кол‑во</th>
        <th class="num">Цена</th>
        <th class="num">Сумма</th>
      </tr>
    </thead>
    <tbody>
      {{range .Lines}}
      <tr>
        <td>{{.Name}}</td>
        <td>{{.SKU}}</td>
        <td class="num">{{.Quantity}}</td>
        <td class="num">{{.Price}}</td>
        <td class="num">{{.Sum}}</td>
      </tr>
      {{end}}
    </tbody>
  </table>

  <div class="total">Итого к оплате: {{.Total}} {{.Currency}}</div>
</body>
</html>`))

func formatMoney(minor int64) string {
	return fmt.Sprintf("%.2f", float64(minor)/100)
}

func ptrStr(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func scanInvoice(row interface{ Scan(...any) error }) (models.OrderInvoice, error) {
	var inv models.OrderInvoice
	err := row.Scan(
		&inv.ID,
		&inv.OrderID,
		&inv.Number,
		&inv.AmountMinor,
		&inv.Currency,
		&inv.Status,
		&inv.IssuedAt,
		&inv.SentAt,
		&inv.CreatedAt,
		&inv.UpdatedAt,
	)
	return inv, err
}

const invoiceColumns = `id, order_id, number, amount_minor, currency, status, issued_at, sent_at, created_at, updated_at`

// buildInvoiceData собирает данные для шаблона счёта по invoice + order + items.
func (s *Server) buildInvoiceData(r *http.Request, inv models.OrderInvoice) (invoiceTemplateData, error) {
	var (
		totalMinor int64
		currency   string
		email      *string
		phone      *string
		addr       *string
	)

	err := s.db.QueryRow(
		r.Context(),
		`SELECT total_minor, currency, customer_email, customer_phone, shipping_address FROM orders WHERE id = $1`,
		inv.OrderID,
	).Scan(&totalMinor, &currency, &email, &phone, &addr)
	if err != nil {
		return invoiceTemplateData{}, err
	}

	rows, err := s.db.Query(
		r.Context(),
		`SELECT name, sku, quantity, price_minor FROM order_items WHERE order_id = $1 ORDER BY id`,
		inv.OrderID,
	)
	if err != nil {
		return invoiceTemplateData{}, err
	}
	defer rows.Close()

	lines := make([]invoiceLine, 0, 8)
	for rows.Next() {
		var (
			name       string
			sku        string
			qty        int
			priceMinor int64
		)
		if err := rows.Scan(&name, &sku, &qty, &priceMinor); err != nil {
			return invoiceTemplateData{}, err
		}
		lines = append(lines, invoiceLine{
			Name:       name,
			SKU:        sku,
			Quantity:   qty,
			PriceMinor: priceMinor,
			Price:      formatMoney(priceMinor),
			Sum:        formatMoney(priceMinor * int64(qty)),
		})
	}
	if err := rows.Err(); err != nil {
		return invoiceTemplateData{}, err
	}

	customerName := "Покупатель"
	if email != nil && *email != "" {
		customerName = *email
	}

	return invoiceTemplateData{
		Number:        inv.Number,
		IssuedAt:      inv.IssuedAt.Format("02.01.2006"),
		OrderID:       inv.OrderID,
		SellerName:    invoiceSellerName,
		SellerINN:     invoiceSellerINN,
		SellerKPP:     invoiceSellerKPP,
		SellerBank:    invoiceSellerBank,
		SellerAddr:    invoiceSellerAddr,
		CustomerName:  customerName,
		CustomerEmail: ptrStr(email),
		CustomerPhone: ptrStr(phone),
		CustomerAddr:  ptrStr(addr),
		Lines:         lines,
		Total:         formatMoney(inv.AmountMinor),
		Currency:      currency,
	}, nil
}

// adminCreateInvoice создаёт черновик счёта для заказа.
// POST /api/v1/admin/orders/{id}/invoices
func (s *Server) adminCreateInvoice(w http.ResponseWriter, r *http.Request) {
	orderID, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid order id")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		slog.Error("failed to begin invoice tx", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create invoice")
		return
	}
	defer tx.Rollback(r.Context())

	var (
		totalMinor int64
		currency   string
		exists     bool
	)

	err = tx.QueryRow(
		r.Context(),
		`SELECT TRUE, total_minor, currency FROM orders WHERE id = $1`,
		orderID,
	).Scan(&exists, &totalMinor, &currency)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "order not found")
			return
		}
		slog.Error("failed to read order for invoice", "order_id", orderID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create invoice")
		return
	}

	var count int
	if err := tx.QueryRow(
		r.Context(),
		`SELECT COUNT(*) FROM order_invoices WHERE order_id = $1`,
		orderID,
	).Scan(&count); err != nil {
		slog.Error("failed to count invoices", "order_id", orderID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create invoice")
		return
	}

	number := fmt.Sprintf("INV-%d-%03d", orderID, count+1)

	var inv models.OrderInvoice
	err = tx.QueryRow(
		r.Context(),
		`
		INSERT INTO order_invoices (order_id, number, amount_minor, currency, status)
		VALUES ($1, $2, $3, $4, 'draft')
		RETURNING `+invoiceColumns,
		orderID, number, totalMinor, currency,
	).Scan(
		&inv.ID, &inv.OrderID, &inv.Number, &inv.AmountMinor, &inv.Currency,
		&inv.Status, &inv.IssuedAt, &inv.SentAt, &inv.CreatedAt, &inv.UpdatedAt,
	)
	if err != nil {
		// Гонка по уникальному номеру.
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, http.StatusConflict, "invoice with this number already exists, refresh and retry")
			return
		}
		slog.Error("failed to insert invoice", "order_id", orderID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create invoice")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("failed to commit invoice", "order_id", orderID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create invoice")
		return
	}

	writeJSON(w, http.StatusCreated, inv)
}

// adminListInvoices возвращает счета для списка заказов.
// GET /api/v1/admin/invoices?order_ids=1,2,3
func (s *Server) adminListInvoices(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimSpace(r.URL.Query().Get("order_ids"))
	if raw == "" {
		writeJSON(w, http.StatusOK, []models.OrderInvoice{})
		return
	}

	parts := strings.Split(raw, ",")
	if len(parts) > maxInvoiceOrderIDsBatch {
		writeError(w, http.StatusBadRequest, "too many order_ids")
		return
	}

	seen := make(map[int64]struct{}, len(parts))
	ids := make([]int64, 0, len(parts))

	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		id, err := strconv.ParseInt(part, 10, 64)
		if err != nil || id <= 0 {
			writeError(w, http.StatusBadRequest, "invalid order_id in list")
			return
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}

	if len(ids) == 0 {
		writeJSON(w, http.StatusOK, []models.OrderInvoice{})
		return
	}

	rows, err := s.db.Query(
		r.Context(),
		`SELECT `+invoiceColumns+` FROM order_invoices WHERE order_id = ANY($1) ORDER BY order_id, id`,
		ids,
	)
	if err != nil {
		slog.Error("failed to query invoices", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load invoices")
		return
	}
	defer rows.Close()

	invoices := make([]models.OrderInvoice, 0, len(ids))
	for rows.Next() {
		inv, err := scanInvoice(rows)
		if err != nil {
			slog.Error("failed to scan invoice", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to load invoices")
			return
		}
		invoices = append(invoices, inv)
	}
	if err := rows.Err(); err != nil {
		slog.Error("invoices rows error", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load invoices")
		return
	}

	writeJSON(w, http.StatusOK, invoices)
}

// adminSendInvoice отправляет счёт по email покупателя и помечает его sent.
// POST /api/v1/admin/invoices/{id}/send
func (s *Server) adminSendInvoice(w http.ResponseWriter, r *http.Request) {
	invoiceID, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid invoice id")
		return
	}

	if !s.smtp.Enabled() {
		writeError(w, http.StatusServiceUnavailable, "SMTP не настроен (задай SMTP_HOST и др.), счёт не отправлен")
		return
	}

	var inv models.OrderInvoice
	err = s.db.QueryRow(
		r.Context(),
		`SELECT `+invoiceColumns+` FROM order_invoices WHERE id = $1`,
		invoiceID,
	).Scan(
		&inv.ID, &inv.OrderID, &inv.Number, &inv.AmountMinor, &inv.Currency,
		&inv.Status, &inv.IssuedAt, &inv.SentAt, &inv.CreatedAt, &inv.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "invoice not found")
			return
		}
		slog.Error("failed to read invoice for send", "invoice_id", invoiceID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load invoice")
		return
	}

	if inv.Status != "draft" {
		writeError(w, http.StatusConflict, "счёт уже отправлен")
		return
	}

	var customerEmail *string
	if err := s.db.QueryRow(
		r.Context(),
		`SELECT customer_email FROM orders WHERE id = $1`,
		inv.OrderID,
	).Scan(&customerEmail); err != nil {
		slog.Error("failed to read order email for send", "order_id", inv.OrderID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load order email")
		return
	}

	if customerEmail == nil || strings.TrimSpace(*customerEmail) == "" {
		writeError(w, http.StatusBadRequest, "у заказа нет email получателя")
		return
	}

	data, err := s.buildInvoiceData(r, inv)
	if err != nil {
		slog.Error("failed to build invoice data for send", "invoice_id", invoiceID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to build invoice")
		return
	}

	var htmlBody strings.Builder
	if err := invoiceTemplate.Execute(&htmlBody, data); err != nil {
		slog.Error("failed to render invoice html", "invoice_id", invoiceID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to render invoice")
		return
	}

	sendCtx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	if err := s.sendInvoiceEmail(sendCtx, *customerEmail, inv.Number, htmlBody.String()); err != nil {
		slog.Error("failed to send invoice email", "invoice_id", invoiceID, "to", *customerEmail, "error", err)
		writeError(w, http.StatusBadGateway, "не удалось отправить письмо: "+err.Error())
		return
	}

	// Атомарная защита от повторной отправки.
	tag, err := s.db.Exec(
		r.Context(),
		`UPDATE order_invoices SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = $1 AND status = 'draft'`,
		invoiceID,
	)
	if err != nil {
		slog.Error("failed to mark invoice sent", "invoice_id", invoiceID, "error", err)
		writeError(w, http.StatusInternalServerError, "письмо отправлено, но не удалось обновить статус")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusConflict, "счёт уже был отправлен параллельно")
		return
	}

	// Перечитаем для актуального ответа.
	if err := s.db.QueryRow(
		r.Context(),
		`SELECT `+invoiceColumns+` FROM order_invoices WHERE id = $1`,
		invoiceID,
	).Scan(
		&inv.ID, &inv.OrderID, &inv.Number, &inv.AmountMinor, &inv.Currency,
		&inv.Status, &inv.IssuedAt, &inv.SentAt, &inv.CreatedAt, &inv.UpdatedAt,
	); err != nil {
		slog.Error("failed to reload invoice after send", "invoice_id", invoiceID, "error", err)
	}

	writeJSON(w, http.StatusOK, inv)
}

// adminRenderInvoice отдаёт HTML счёта для просмотра/печати админом.
// GET /api/v1/admin/invoices/{id}/view  (обёрнут в adminMiddleware в server.go)
func (s *Server) adminRenderInvoice(w http.ResponseWriter, r *http.Request) {
	invoiceID, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid invoice id")
		return
	}

	var inv models.OrderInvoice
	err = s.db.QueryRow(
		r.Context(),
		`SELECT `+invoiceColumns+` FROM order_invoices WHERE id = $1`,
		invoiceID,
	).Scan(
		&inv.ID, &inv.OrderID, &inv.Number, &inv.AmountMinor, &inv.Currency,
		&inv.Status, &inv.IssuedAt, &inv.SentAt, &inv.CreatedAt, &inv.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		slog.Error("failed to read invoice for view", "invoice_id", invoiceID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load invoice")
		return
	}

	data, err := s.buildInvoiceData(r, inv)
	if err != nil {
		slog.Error("failed to build invoice data for view", "invoice_id", invoiceID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to build invoice")
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := invoiceTemplate.Execute(w, data); err != nil {
		slog.Error("failed to render invoice view", "invoice_id", invoiceID, "error", err)
	}
}

// sendInvoiceEmail отправляет HTML-счёт на указанный адрес через net/smtp.
// Поддерживает implicit TLS (порт 465) и STARTTLS (587 и др.).
func (s *Server) sendInvoiceEmail(ctx context.Context, to, number, htmlBody string) error {
	cfg := s.smtp

	portStr := strconv.Itoa(cfg.Port)
	addr := cfg.Host + ":" + portStr

	fromAddr := cfg.From
	if fromAddr == "" {
		fromAddr = cfg.Username
	}
	if fromAddr == "" {
		return errors.New("SMTP_FROM или SMTP_USERNAME не заданы")
	}

	fromDisplay := fromAddr
	if cfg.FromName != "" {
		fromDisplay = fmt.Sprintf("%s <%s>", cfg.FromName, fromAddr)
	}

	header := textproto.MIMEHeader{}
	header.Set("From", fromDisplay)
	header.Set("To", to)
	header.Set("Subject", "Счёт "+number+" — Radio Store")
	header.Set("MIME-Version", "1.0")
	header.Set("Content-Type", "text/html; charset=utf-8")

	var msg strings.Builder
	for k, v := range header {
		msg.WriteString(k);msg.WriteString(": ");msg.WriteString(strings.Join(v, ", "));msg.WriteString("\r\n")
	}
	msg.WriteString("\r\n")
	msg.WriteString(htmlBody)

	auth := smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)

	// Уважение отмены контекста: настраиваем дедлайн через dial-контекст нельзя
	// в net/smtp напрямую, поэтому проверяем ctx до и после ключевых шагов.
	if err := ctx.Err(); err != nil {
		return err
	}

	var client *smtp.Client
	var err error

	if cfg.Port == 465 {
		tlsCfg := &tls.Config{ServerName: cfg.Host, MinVersion: tls.VersionTLS12}
		dialer := &net.Dialer{}
		conn, derr := dialer.DialContext(ctx, "tcp", addr)
		if derr != nil {
			return derr
		}
		tlsConn := tls.Client(conn, tlsCfg)
		if cerr := tlsConn.HandshakeContext(ctx); cerr != nil {
			conn.Close()
			return cerr
		}
		client, err = smtp.NewClient(tlsConn, cfg.Host)
	} else {
		dialer := &net.Dialer{}
		conn, derr := dialer.DialContext(ctx, "tcp", addr)
		if derr != nil {
			return derr
		}
		client, err = smtp.NewClient(conn, cfg.Host)
		if err == nil {
			if ok, _ := client.Extension("STARTTLS"); ok {
				tlsCfg := &tls.Config{ServerName: cfg.Host, MinVersion: tls.VersionTLS12}
				if serr := client.StartTLS(tlsCfg); serr != nil {
					client.Close()
					return serr
				}
			}
		}
	}
	if err != nil {
		return err
	}
	defer client.Close()

	if ok, _ := client.Extension("AUTH"); ok {
		if aerr := client.Auth(auth); aerr != nil {
			return aerr
		}
	}

	if err := client.Mail(fromAddr); err != nil {
		return err
	}
	if err := client.Rcpt(to); err != nil {
		return err
	}

	writer, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := writer.Write([]byte(msg.String())); err != nil {
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}

	return client.Quit()
}