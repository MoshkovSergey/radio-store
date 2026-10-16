ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS views_count BIGINT NOT NULL DEFAULT 0;

ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS likes_count BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS blog_post_likes (
    id            BIGSERIAL PRIMARY KEY,
    post_id       BIGINT       NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    visitor_token TEXT         NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_blog_post_likes_post_visitor
    ON blog_post_likes (post_id, visitor_token);

CREATE INDEX IF NOT EXISTS idx_blog_post_likes_post_id
    ON blog_post_likes (post_id);backend/migrations/0006_blog_engagement.down.sql