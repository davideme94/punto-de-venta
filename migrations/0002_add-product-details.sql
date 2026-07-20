ALTER TABLE products
ADD COLUMN category TEXT NOT NULL DEFAULT 'General';

ALTER TABLE products
ADD COLUMN cost_price_cents INTEGER NOT NULL DEFAULT 0;

ALTER TABLE products
ADD COLUMN stock REAL NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_products_category
ON products(category);

CREATE INDEX IF NOT EXISTS idx_products_active
ON products(active);