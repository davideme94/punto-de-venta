ALTER TABLE sales
ADD COLUMN cashier_user_id TEXT
REFERENCES app_users(id);

ALTER TABLE sales
ADD COLUMN physical_register_session_id TEXT
REFERENCES physical_register_sessions(id);

CREATE INDEX IF NOT EXISTS idx_sales_cashier_user
ON sales(cashier_user_id);

CREATE INDEX IF NOT EXISTS idx_sales_physical_session
ON sales(physical_register_session_id);

CREATE TRIGGER IF NOT EXISTS validate_sale_cashier_session_insert
BEFORE INSERT ON sales
FOR EACH ROW
WHEN
  (
    NEW.cashier_user_id IS NULL
    AND NEW.physical_register_session_id IS NOT NULL
  )
  OR
  (
    NEW.cashier_user_id IS NOT NULL
    AND NEW.physical_register_session_id IS NULL
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'SALE_CASHIER_AND_SESSION_REQUIRED_TOGETHER'
  );
END;

CREATE TRIGGER IF NOT EXISTS validate_sale_open_session_insert
BEFORE INSERT ON sales
FOR EACH ROW
WHEN
  NEW.cashier_user_id IS NOT NULL
  AND NEW.physical_register_session_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM physical_register_sessions
    WHERE
      id = NEW.physical_register_session_id
      AND responsible_user_id = NEW.cashier_user_id
      AND status = 'ABIERTA'
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'INVALID_OR_CLOSED_REGISTER_SESSION'
  );
END;

CREATE TRIGGER IF NOT EXISTS validate_sale_cashier_session_update
BEFORE UPDATE OF
  cashier_user_id,
  physical_register_session_id
ON sales
FOR EACH ROW
WHEN
  (
    NEW.cashier_user_id IS NULL
    AND NEW.physical_register_session_id IS NOT NULL
  )
  OR
  (
    NEW.cashier_user_id IS NOT NULL
    AND NEW.physical_register_session_id IS NULL
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'SALE_CASHIER_AND_SESSION_REQUIRED_TOGETHER'
  );
END;

CREATE TRIGGER IF NOT EXISTS validate_sale_open_session_update
BEFORE UPDATE OF
  cashier_user_id,
  physical_register_session_id
ON sales
FOR EACH ROW
WHEN
  NEW.cashier_user_id IS NOT NULL
  AND NEW.physical_register_session_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM physical_register_sessions
    WHERE
      id = NEW.physical_register_session_id
      AND responsible_user_id = NEW.cashier_user_id
      AND status = 'ABIERTA'
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'INVALID_OR_CLOSED_REGISTER_SESSION'
  );
END;