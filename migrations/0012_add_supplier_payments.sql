CREATE TABLE IF NOT EXISTS supplier_payment_counter (
  id INTEGER PRIMARY KEY
    CHECK (id = 1),

  last_number INTEGER NOT NULL
    DEFAULT 0
    CHECK (last_number >= 0)
);

INSERT OR IGNORE INTO supplier_payment_counter (
  id,
  last_number
)
VALUES (
  1,
  0
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id TEXT PRIMARY KEY,

  payment_number INTEGER NOT NULL
    UNIQUE,

  operator_user_id TEXT NOT NULL,

  operator_physical_session_id TEXT NOT NULL,

  virtual_account_session_id TEXT,

  fund_source TEXT NOT NULL
    CHECK (
      fund_source IN (
        'PHYSICAL_REGISTER',
        'VIRTUAL_ACCOUNT'
      )
    ),

  supplier_name TEXT NOT NULL
    CHECK (
      LENGTH(TRIM(supplier_name)) > 0
    ),

  amount_cents INTEGER NOT NULL
    CHECK (
      amount_cents > 0
    ),

  reference TEXT,

  notes TEXT,

  status TEXT NOT NULL
    DEFAULT 'COMPLETADA'
    CHECK (
      status IN (
        'COMPLETADA',
        'ANULADA'
      )
    ),

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  cancelled_at TEXT,

  cancelled_by_user_id TEXT,

  cancellation_reason TEXT,

  FOREIGN KEY (
    operator_user_id
  )
  REFERENCES app_users (
    id
  ),

  FOREIGN KEY (
    operator_physical_session_id
  )
  REFERENCES physical_register_sessions (
    id
  ),

  FOREIGN KEY (
    virtual_account_session_id
  )
  REFERENCES virtual_account_sessions (
    id
  ),

  FOREIGN KEY (
    cancelled_by_user_id
  )
  REFERENCES app_users (
    id
  ),

  CHECK (
    (
      fund_source = 'PHYSICAL_REGISTER'
      AND virtual_account_session_id IS NULL
    )

    OR

    (
      fund_source = 'VIRTUAL_ACCOUNT'
      AND virtual_account_session_id IS NOT NULL
    )
  ),

  CHECK (
    status = 'COMPLETADA'

    OR

    (
      status = 'ANULADA'
      AND cancelled_at IS NOT NULL
      AND cancelled_by_user_id IS NOT NULL
      AND LENGTH(TRIM(cancellation_reason)) > 0
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_number
ON supplier_payments (
  payment_number
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_operator
ON supplier_payments (
  operator_user_id,
  created_at
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_physical_session
ON supplier_payments (
  operator_physical_session_id,
  fund_source,
  status
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_virtual_session
ON supplier_payments (
  virtual_account_session_id,
  fund_source,
  status
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier
ON supplier_payments (
  supplier_name,
  created_at
);