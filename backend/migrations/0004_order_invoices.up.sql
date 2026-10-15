CREATE TABLE IF NOT EXISTS order_invoices (
    id           BIGSERIAL    PRIMARY KEY,
    order_id     BIGINT       NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    number       TEXT         NOT NULL UNIQUE,
    amount_minor BIGINT       NOT NULL,
    currency     TEXT         NOT NULL,
    status       TEXT         NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'sent')),
    issued_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    sent_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_invoices_order_id
    ON order_invoices (order_id);