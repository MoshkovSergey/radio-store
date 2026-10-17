CREATE TABLE IF NOT EXISTS site_visits (
    id              BIGSERIAL PRIMARY KEY,
    visitor_token   TEXT NOT NULL,
    page_path       TEXT NOT NULL,
    referrer        TEXT,
    user_agent_hash TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_visits_created_at
    ON site_visits (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_visits_page_path
    ON site_visits (page_path);

-- Уникальный индекс: один посетитель = одно посещение страницы за 5 минут
-- (защита от случайных двойных отправок, не от накрутки)
CREATE INDEX IF NOT EXISTS idx_site_visits_visitor_page_time
    ON site_visits (visitor_token, page_path, created_at);