CREATE TABLE IF NOT EXISTS cash_box_operation_counter (
  id INTEGER PRIMARY KEY
    CHECK (id = 1),

  last_number INTEGER NOT NULL
    DEFAULT 0
    CHECK (last_number >= 0)
);

INSERT OR IGNORE INTO cash_box_operation_counter (
  id,
  last_number
)
VALUES (
  1,
  0
);

CREATE TABLE IF NOT EXISTS cash_box_operations (
  id TEXT PRIMARY KEY,

  operation_number INTEGER NOT NULL
    UNIQUE,

  operation_type TEXT NOT NULL
    CHECK (
      operation_type IN (
        'SERVICIO',
        'QUINIELA'
      )
    ),

  operator_user_id TEXT NOT NULL,

  operator_physical_session_id TEXT NOT NULL,

  virtual_account_session_id TEXT,

  payment_method TEXT NOT NULL
    DEFAULT 'EFECTIVO'
    CHECK (
      payment_method = 'EFECTIVO'
    ),

  amount_cents INTEGER NOT NULL
    CHECK (
      amount_cents > 0
    ),

  description TEXT,

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
      operation_type = 'SERVICIO'

      AND virtual_account_session_id
          IS NOT NULL
    )

    OR

    (
      operation_type = 'QUINIELA'

      AND virtual_account_session_id
          IS NULL
    )
  ),

  CHECK (
    status = 'COMPLETADA'

    OR

    (
      status = 'ANULADA'

      AND cancelled_at
          IS NOT NULL

      AND cancelled_by_user_id
          IS NOT NULL

      AND cancellation_reason
          IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_cash_box_operations_number
ON cash_box_operations (
  operation_number
);

CREATE INDEX IF NOT EXISTS idx_cash_box_operations_operator
ON cash_box_operations (
  operator_user_id,
  created_at
);

CREATE INDEX IF NOT EXISTS idx_cash_box_operations_physical_session
ON cash_box_operations (
  operator_physical_session_id,
  operation_type,
  status
);

CREATE INDEX IF NOT EXISTS idx_cash_box_operations_virtual_session
ON cash_box_operations (
  virtual_account_session_id,
  operation_type,
  status
);

CREATE INDEX IF NOT EXISTS idx_cash_box_operations_created_at
ON cash_box_operations (
  created_at
);

CREATE TRIGGER IF NOT EXISTS validate_cash_box_operation_cashier
BEFORE INSERT ON cash_box_operations
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM app_users
  WHERE
    id = NEW.operator_user_id
    AND role = 'CAJERO'
    AND active = 1
)
BEGIN
  SELECT RAISE(
    ABORT,
    'INVALID_CASHIER'
  );
END;

CREATE TRIGGER IF NOT EXISTS validate_cash_box_operation_register
BEFORE INSERT ON cash_box_operations
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM physical_register_sessions
  WHERE
    id = NEW.operator_physical_session_id
    AND responsible_user_id = NEW.operator_user_id
    AND status = 'ABIERTA'
    AND cashier_confirmation_status = 'CONFIRMADA'
)
BEGIN
  SELECT RAISE(
    ABORT,
    'INVALID_OPERATOR_REGISTER'
  );
END;

CREATE TRIGGER IF NOT EXISTS validate_cash_box_operation_virtual_session
BEFORE INSERT ON cash_box_operations
FOR EACH ROW
WHEN
  NEW.operation_type = 'SERVICIO'
  AND NOT EXISTS (
    SELECT 1
    FROM virtual_account_sessions
    WHERE
      id = NEW.virtual_account_session_id
      AND status = 'ABIERTA'
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'INVALID_VIRTUAL_SESSION'
  );
END;

CREATE TRIGGER IF NOT EXISTS validate_cash_box_operation_business_date
BEFORE INSERT ON cash_box_operations
FOR EACH ROW
WHEN
  NEW.operation_type = 'SERVICIO'
  AND NOT EXISTS (
    SELECT 1
    FROM physical_register_sessions AS physical_session
    INNER JOIN virtual_account_sessions AS virtual_session
      ON virtual_session.id = NEW.virtual_account_session_id
    WHERE
      physical_session.id = NEW.operator_physical_session_id
      AND physical_session.business_date =
          virtual_session.business_date
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'BUSINESS_DATE_MISMATCH'
  );
END;
