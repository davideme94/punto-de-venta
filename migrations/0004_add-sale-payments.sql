CREATE TABLE IF NOT EXISTS sale_payments (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,

  method TEXT NOT NULL
    CHECK (
      method IN (
        'EFECTIVO',
        'TRANSFERENCIA',
        'TARJETA'
      )
    ),

  amount_cents INTEGER NOT NULL
    CHECK (amount_cents > 0),

  reference TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (sale_id)
    REFERENCES sales(id)
);

CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_id
ON sale_payments(sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_payments_method
ON sale_payments(method);

CREATE TRIGGER IF NOT EXISTS prevent_negative_product_stock
BEFORE UPDATE OF stock ON products
FOR EACH ROW
WHEN NEW.stock < 0
BEGIN
  SELECT RAISE(
    ABORT,
    'INSUFFICIENT_STOCK'
  );
END;