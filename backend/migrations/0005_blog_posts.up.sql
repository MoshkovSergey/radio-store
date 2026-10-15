CREATE TABLE IF NOT EXISTS blog_posts (
    id              BIGSERIAL    PRIMARY KEY,
    slug            TEXT         NOT NULL UNIQUE,
    title           TEXT         NOT NULL,
    excerpt         TEXT,
    body            TEXT         NOT NULL,
    cover_image_url TEXT,
    author          TEXT,
    is_published    BOOLEAN      NOT NULL DEFAULT FALSE,
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_published
    ON blog_posts (is_published, published_at DESC);