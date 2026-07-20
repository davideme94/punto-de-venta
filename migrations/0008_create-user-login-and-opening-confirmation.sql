CREATE TABLE IF NOT EXISTS app_user_sessions (
  id TEXT PRIMARY KEY,

  user_id TEXT NOT NULL,

  token_hash TEXT NOT NULL UNIQUE,

  device_name TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  expires_at TEXT NOT NULL,

  revoked_at TEXT,

  FOREIGN KEY (user_id)
    REFERENCES app_users(id)
);

CREATE INDEX IF NOT EXISTS idx_app_user_sessions_user
ON app_user_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_app_user_sessions_token
ON app_user_sessions(token_hash);

CREATE INDEX IF NOT EXISTS idx_app_user_sessions_expires
ON app_user_sessions(expires_at);

ALTER TABLE app_users
ADD COLUMN pin_updated_at TEXT;

ALTER TABLE physical_register_sessions
ADD COLUMN cashier_confirmation_status TEXT
NOT NULL DEFAULT 'PENDIENTE'
CHECK (
  cashier_confirmation_status IN (
    'PENDIENTE',
    'CONFIRMADA',
    'OBSERVADA'
  )
);

ALTER TABLE physical_register_sessions
ADD COLUMN cashier_confirmed_amount_cents INTEGER
CHECK (
  cashier_confirmed_amount_cents IS NULL
  OR cashier_confirmed_amount_cents >= 0
);

ALTER TABLE physical_register_sessions
ADD COLUMN cashier_confirmation_difference_cents INTEGER;

ALTER TABLE physical_register_sessions
ADD COLUMN cashier_confirmed_at TEXT;

ALTER TABLE physical_register_sessions
ADD COLUMN cashier_confirmed_by_user_id TEXT
REFERENCES app_users(id);

ALTER TABLE physical_register_sessions
ADD COLUMN cashier_confirmation_notes TEXT;

CREATE TRIGGER IF NOT EXISTS validate_cashier_confirmation_user
BEFORE UPDATE OF
  cashier_confirmation_status,
  cashier_confirmed_by_user_id
ON physical_register_sessions
FOR EACH ROW
WHEN
  NEW.cashier_confirmation_status <> 'PENDIENTE'
  AND (
    NEW.cashier_confirmed_by_user_id IS NULL
    OR NEW.cashier_confirmed_by_user_id <>
       NEW.responsible_user_id
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'ONLY_RESPONSIBLE_CASHIER_CAN_CONFIRM'
  );
END;

CREATE TRIGGER IF NOT EXISTS validate_cashier_confirmation_data
BEFORE UPDATE OF
  cashier_confirmation_status
ON physical_register_sessions
FOR EACH ROW
WHEN
  NEW.cashier_confirmation_status IN (
    'CONFIRMADA',
    'OBSERVADA'
  )
  AND (
    NEW.cashier_confirmed_amount_cents IS NULL
    OR NEW.cashier_confirmation_difference_cents IS NULL
    OR NEW.cashier_confirmed_at IS NULL
    OR NEW.cashier_confirmed_by_user_id IS NULL
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'INCOMPLETE_CASHIER_CONFIRMATION'
  );
END;

CREATE TRIGGER IF NOT EXISTS validate_confirmed_cashier_difference
BEFORE UPDATE OF
  cashier_confirmation_status,
  cashier_confirmation_difference_cents
ON physical_register_sessions
FOR EACH ROW
WHEN
  NEW.cashier_confirmation_status = 'CONFIRMADA'
  AND NEW.cashier_confirmation_difference_cents <> 0
BEGIN
  SELECT RAISE(
    ABORT,
    'CONFIRMED_CASHIER_MUST_HAVE_ZERO_DIFFERENCE'
  );
END;

CREATE TRIGGER IF NOT EXISTS validate_observed_cashier_difference
BEFORE UPDATE OF
  cashier_confirmation_status,
  cashier_confirmation_difference_cents
ON physical_register_sessions
FOR EACH ROW
WHEN
  NEW.cashier_confirmation_status = 'OBSERVADA'
  AND NEW.cashier_confirmation_difference_cents = 0
BEGIN
  SELECT RAISE(
    ABORT,
    'OBSERVED_CASHIER_MUST_HAVE_DIFFERENCE'
  );
END;

CREATE INDEX IF NOT EXISTS idx_physical_sessions_confirmation_status
ON physical_register_sessions(
  cashier_confirmation_status
);

CREATE INDEX IF NOT EXISTS idx_physical_sessions_confirmed_by
ON physical_register_sessions(
  cashier_confirmed_by_user_id
);
