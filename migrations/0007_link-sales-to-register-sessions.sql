/*
 * Vincula cada venta con:
 *
 * - la empleada que realizó la operación;
 * - la sesión de caja física en la que trabajaba.
 *
 * Las columnas son inicialmente opcionales para
 * conservar las ventas históricas que ya existen.
 */

ALTER TABLE sales
ADD COLUMN cashier_user_id TEXT
REFERENCES app_users(id);

ALTER TABLE sales
ADD COLUMN physical_register_session_id TEXT
REFERENCES physical_register_sessions(id);

/*
 * Índices para informes por cajera,
 * caja y sesión de trabajo.
 */

CREATE INDEX IF NOT EXISTS idx_sales_cashier_user
ON sales(cashier_user_id);

CREATE INDEX IF NOT EXISTS idx_sales_physical_session
ON sales(physical_register_session_id);

/*
 * Impide guardar solamente uno de los dos datos.
 *
 * Una venta debe tener:
 * - cajera y sesión;
 * o
 * - ambos campos vacíos para ventas históricas.
 */

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

/*
 * Comprueba que:
 *
 * - la sesión exista;
 * - continúe abierta;
 * - la cajera sea la responsable de esa sesión.
 */

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

/*
 * Las mismas protecciones se aplican
 * si una venta existente es modificada.
 */

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