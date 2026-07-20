CREATE TABLE IF NOT EXISTS cash_withdrawal_counter (
  id INTEGER PRIMARY KEY
    CHECK (id = 1),

  last_number INTEGER NOT NULL
    DEFAULT 0
    CHECK (last_number >= 0)
);

INSERT OR IGNORE INTO cash_withdrawal_counter (
  id,
  last_number
)
VALUES (
  1,
  0
);

CREATE TABLE IF NOT EXISTS cash_withdrawals (
  id TEXT PRIMARY KEY,

  operation_number INTEGER NOT NULL
    UNIQUE,

  operator_user_id TEXT NOT NULL,

  physical_register_session_id TEXT,

  virtual_account_session_id TEXT NOT NULL,

  cash_source TEXT NOT NULL
    CHECK (
      cash_source IN (
        'PHYSICAL_REGISTER',
        'VIRTUAL_ACCOUNT'
      )
    ),

  withdrawal_amount_cents INTEGER NOT NULL
    CHECK (
      withdrawal_amount_cents > 0
    ),

  commission_rate_basis_points INTEGER NOT NULL
    DEFAULT 300
    CHECK (
      commission_rate_basis_points >= 0
    ),

  commission_amount_cents INTEGER NOT NULL
    CHECK (
      commission_amount_cents >= 0
    ),

  transfer_total_cents INTEGER NOT NULL
    CHECK (
      transfer_total_cents > 0
    ),

  transfer_reference TEXT,

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
    physical_register_session_id
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
    transfer_total_cents =
      withdrawal_amount_cents +
      commission_amount_cents
  ),

  CHECK (
    (
      cash_source =
        'PHYSICAL_REGISTER'

      AND physical_register_session_id
          IS NOT NULL
    )

    OR

    (
      cash_source =
        'VIRTUAL_ACCOUNT'

      AND physical_register_session_id
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

CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_operator
ON cash_withdrawals (
  operator_user_id,
  created_at
);

CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_physical_session
ON cash_withdrawals (
  physical_register_session_id,
  status
);

CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_virtual_session
ON cash_withdrawals (
  virtual_account_session_id,
  status
);

CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_created_at
ON cash_withdrawals (
  created_at
);

CREATE TRIGGER IF NOT EXISTS validate_cash_withdrawal_cashier
BEFORE INSERT ON cash_withdrawals
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

CREATE TRIGGER IF NOT EXISTS validate_cash_withdrawal_confirmed_register
BEFORE INSERT ON cash_withdrawals
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM physical_register_sessions
  WHERE
    responsible_user_id = NEW.operator_user_id
    AND status = 'ABIERTA'
    AND cashier_confirmation_status = 'CONFIRMADA'
)
BEGIN
  SELECT RAISE(
    ABORT,
    'CASHIER_WITHOUT_CONFIRMED_REGISTER'
  );
END;

CREATE TRIGGER IF NOT EXISTS validate_cash_withdrawal_virtual_session
BEFORE INSERT ON cash_withdrawals
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM virtual_account_sessions
  WHERE
    id = NEW.virtual_account_session_id
    AND status = 'ABIERTA'
)
BEGIN
  SELECT RAISE(
    ABORT,
    'INVALID_OR_CLOSED_VIRTUAL_SESSION'
  );
END;

CREATE TRIGGER IF NOT EXISTS validate_cash_withdrawal_physical_source
BEFORE INSERT ON cash_withdrawals
FOR EACH ROW
WHEN
  NEW.cash_source = 'PHYSICAL_REGISTER'
  AND NOT EXISTS (
    SELECT 1
    FROM physical_register_sessions
    WHERE
      id = NEW.physical_register_session_id
      AND responsible_user_id = NEW.operator_user_id
      AND status = 'ABIERTA'
      AND cashier_confirmation_status = 'CONFIRMADA'
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'INVALID_PHYSICAL_CASH_SOURCE'
  );
END;

CREATE TRIGGER IF NOT EXISTS validate_cash_withdrawal_business_date
BEFORE INSERT ON cash_withdrawals
FOR EACH ROW
WHEN
  NEW.cash_source = 'PHYSICAL_REGISTER'
  AND NOT EXISTS (
    SELECT 1
    FROM physical_register_sessions AS physical_session
    INNER JOIN virtual_account_sessions AS virtual_session
      ON virtual_session.id = NEW.virtual_account_session_id
    WHERE
      physical_session.id = NEW.physical_register_session_id
      AND physical_session.business_date =
          virtual_session.business_date
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'REGISTER_BUSINESS_DATE_MISMATCH'
  );
END;
