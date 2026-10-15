DROP INDEX IF EXISTS idx_product_images_position;
DROP INDEX IF EXISTS idx_product_images_product_id;
DROP INDEX IF EXISTS uq_product_images_primary;

ALTER TABLE product_images
    DROP COLUMN IF EXISTS is_primary;