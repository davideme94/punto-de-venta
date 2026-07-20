CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,

  sale_number INTEGER NOT NULL UNIQUE,

  operation_type TEXT NOT NULL DEFAULT 'NEGOCIO'
    CHECK (
      operation_type IN (
        'NEGOCIO',
        'VIRTUAL',
        'RETIRO',
        'QUINIELA'
      )
    ),

  payment_method TEXT NOT NULL DEFAULT 'EFECTIVO'
    CHECK (
      payment_method IN (
        'EFECTIVO',
        'TRANSFERENCIA',
        'TARJETA',
        'MIXTO',
        'FIADO'
      )
    ),

  subtotal_cents INTEGER NOT NULL DEFAULT 0,

  total_cents INTEGER NOT NULL
    CHECK (total_cents >= 0),

  status TEXT NOT NULL DEFAULT 'COMPLETADA'
    CHECK (
      status IN (
        'COMPLETADA',
        'ANULADA'
      )
    ),

  created_by TEXT NOT NULL DEFAULT 'Administrador',

  notes TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  cancelled_at TEXT,

  cancelled_by TEXT,

  cancellation_reason TEXT
);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,

  sale_id TEXT NOT NULL,

  product_id TEXT,

  barcode TEXT,

  product_name TEXT NOT NULL,

  quantity REAL NOT NULL
    CHECK (quantity > 0),

  unit_cost_cents INTEGER NOT NULL DEFAULT 0
    CHECK (unit_cost_cents >= 0),

  unit_price_cents INTEGER NOT NULL
    CHECK (unit_price_cents >= 0),

  line_total_cents INTEGER NOT NULL
    CHECK (line_total_cents >= 0),

  is_manual INTEGER NOT NULL DEFAULT 0
    CHECK (is_manual IN (0, 1)),

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (sale_id)
    REFERENCES sales(id),

  FOREIGN KEY (product_id)
    REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS sale_counter (
  id INTEGER PRIMARY KEY
    CHECK (id = 1),

  last_number INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO sale_counter (
  id,
  last_number
)
VALUES (
  1,
  0
);

CREATE INDEX IF NOT EXISTS idx_sales_created_at
ON sales(created_at);

CREATE INDEX IF NOT EXISTS idx_sales_created_by
ON sales(created_by);

CREATE INDEX IF NOT EXISTS idx_sales_operation_type
ON sales(operation_type);

CREATE INDEX IF NOT EXISTS idx_sales_status
ON sales(status);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id
ON sale_items(sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_product_id
ON sale_items(product_id);