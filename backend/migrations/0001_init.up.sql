CREATE TABLE categories (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    parent_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,
    category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    sku TEXT NOT NULL UNIQUE,
    manufacturer TEXT,
    description TEXT,
    price_minor BIGINT NOT NULL CHECK (price_minor >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'RUB',
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stock (
    product_id BIGINT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_images (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    alt TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cart_items (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, product_id)
);

CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (
        status IN (
            'new',
            'processing',
            'paid',
            'shipped',
            'completed',
            'cancelled'
        )
    ),
    total_minor BIGINT NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'RUB',
    shipping_address TEXT,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    sku TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price_minor BIGINT NOT NULL CHECK (price_minor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (order_id, product_id)
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_set_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER stock_set_updated_at
BEFORE UPDATE ON stock
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER cart_items_set_updated_at
BEFORE UPDATE ON cart_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_is_active ON products(is_active);
CREATE INDEX idx_products_attributes ON products USING GIN (attributes);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);

INSERT INTO categories (id, name, slug, parent_id)
VALUES
    (1, 'Резисторы', 'rezistory', NULL),
    (2, 'Конденсаторы', 'kondensatory', NULL),
    (3, 'Микроконтроллеры', 'mikrokontrollery', NULL),
    (4, 'Модули и платы', 'moduli-i-platy', NULL),
    (5, 'Инструменты', 'instrumenty', NULL);

INSERT INTO products (
    id,
    category_id,
    name,
    slug,
    sku,
    manufacturer,
    description,
    price_minor,
    currency,
    is_active,
    attributes
)
VALUES
    (
        1,
        1,
        'Резистор SMD 0805 10 кОм 1%',
        'rezistor-smd-0805-10kom-1',
        'RC0805FR-0710KL',
        'YAGEO',
        'Чип-резистор 0805, 10 кОм, точность 1%.',
        150,
        'RUB',
        TRUE,
        '{"type":"resistor","resistance":"10 kOhm","package":"0805","tolerance":"1%"}'::jsonb
    ),
    (
        2,
        2,
        'Керамический конденсатор 100 нФ 50 В',
        'keramicheskiy-kondensator-100nf-50v',
        'GRM188R71H104KA93D',
        'Murata',
        'MLCC конденсатор 0603, 100 нФ, 50 В.',
        220,
        'RUB',
        TRUE,
        '{"type":"capacitor","capacitance":"100 nF","voltage":"50 V","package":"0603"}'::jsonb
    ),
    (
        3,
        3,
        'Микроконтроллер ATmega328P-PU',
        'mikrokontroller-atmega328p-pu',
        'ATMEGA328P-PU',
        'Microchip',
        '8-битный AVR микроконтроллер в корпусе DIP-28.',
        39000,
        'RUB',
        TRUE,
        '{"type":"microcontroller","family":"AVR","package":"DIP-28","flash":"32 KB"}'::jsonb
    ),
    (
        4,
        4,
        'Модуль ESP32-WROOM-32',
        'modul-esp32-wroom-32',
        'ESP32-WROOM-32',
        'Espressif',
        'Wi-Fi + Bluetooth модуль на базе ESP32.',
        69000,
        'RUB',
        TRUE,
        '{"type":"module","wireless":["Wi-Fi","Bluetooth"],"family":"ESP32"}'::jsonb
    );

INSERT INTO stock (product_id, quantity)
VALUES
    (1, 500),
    (2, 1000),
    (3, 25),
    (4, 40);

SELECT setval(pg_get_serial_sequence('categories', 'id'), (SELECT COALESCE(MAX(id), 1) FROM categories));
SELECT setval(pg_get_serial_sequence('products', 'id'), (SELECT COALESCE(MAX(id), 1) FROM products));