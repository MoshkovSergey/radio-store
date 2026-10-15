ALTER TABLE orders
    DROP COLUMN IF EXISTS customer_phone,
    DROP COLUMN IF EXISTS customer_email;