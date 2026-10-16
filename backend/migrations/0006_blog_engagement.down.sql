DROP INDEX IF EXISTS idx_blog_post_likes_post_id;
DROP INDEX IF EXISTS uq_blog_post_likes_post_visitor;
DROP TABLE IF EXISTS blog_post_likes;

ALTER TABLE blog_posts
    DROP COLUMN IF EXISTS likes_count;

ALTER TABLE blog_posts
    DROP COLUMN IF EXISTS views_count;