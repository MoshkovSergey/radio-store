ALTER TABLE product_images
    ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX uq_product_images_primary
    ON product_images (product_id)
    WHERE is_primary = TRUE;

CREATE INDEX idx_product_images_product_id ON product_images (product_id);
CREATE INDEX idx_product_images_position ON product_images (product_id, position);