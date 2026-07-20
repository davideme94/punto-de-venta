/*
 * SERVICIOS, BOLETAS Y QUINIELA
 *
 * SERVICIO:
 * El efectivo entra en la Caja Virtual.
 *
 * QUINIELA:
 * El efectivo entra en la caja física
 * asignada a la cajera.
 *
 * Ambas operaciones se cobran en efectivo.
 */


/*
 * Contador correlativo de operaciones.
 */
CREATE TABLE cash_box_operation_counter (
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


/*
 * Operaciones de efectivo correspondientes
 * a Servicios, Boletas y Quiniela.
 */
CREATE TABLE cash_box_operations (
  id TEXT PRIMARY KEY,

  operation_number INTEGER NOT NULL
    UNIQUE,

  /*
   * SERVICIO:
   * Pago de servicios o boletas.
   *
   * QUINIELA:
   * Jugada o cobro registrado en caja.
   */
  operation_type TEXT NOT NULL
    CHECK (
      operation_type IN (
        'SERVICIO',
        'QUINIELA'
      )
    ),

  /*
   * Cajera que realizó la operación.
   */
  operator_user_id TEXT NOT NULL,

  /*
   * Caja física que tenía asignada
   * la cajera al realizar la operación.
   *
   * En Quiniela también es la caja
   * donde ingresa el efectivo.
   *
   * En Servicios se conserva solamente
   * para saber qué cajera y sesión
   * realizaron la operación.
   */
  operator_physical_session_id TEXT NOT NULL,

  /*
   * Solo se completa para Servicios.
   *
   * Indica la Caja Virtual física
   * donde ingresa el efectivo.
   */
  virtual_account_session_id TEXT,

  /*
   * Actualmente ambas operaciones
   * se cobran únicamente en efectivo.
   */
  payment_method TEXT NOT NULL
    DEFAULT 'EFECTIVO'
    CHECK (
      payment_method = 'EFECTIVO'
    ),

  /*
   * Dinero recibido físicamente.
   *
   * Ejemplo:
   * $5.000 = 500000 centavos.
   */
  amount_cents INTEGER NOT NULL
    CHECK (
      amount_cents > 0
    ),

  /*
   * Descripción de la operación.
   *
   * Ejemplos:
   * Pago de luz
   * Boleta de gas
   * Quiniela nocturna
   */
  description TEXT,

  /*
   * Número de comprobante, ticket,
   * boleta o referencia opcional.
   */
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

  /*
   * Servicios debe tener una sesión
   * de Caja Virtual.
   *
   * Quiniela no utiliza Caja Virtual.
   */
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

  /*
   * Una operación anulada debe guardar
   * quién la anuló, cuándo y por qué.
   */
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


/*
 * Índices para consultas y cierres.
 */
CREATE INDEX idx_cash_box_operations_number
ON cash_box_operations (
  operation_number
);

CREATE INDEX idx_cash_box_operations_operator
ON cash_box_operations (
  operator_user_id,
  created_at
);

CREATE INDEX idx_cash_box_operations_physical_session
ON cash_box_operations (
  operator_physical_session_id,
  operation_type,
  status
);

CREATE INDEX idx_cash_box_operations_virtual_session
ON cash_box_operations (
  virtual_account_session_id,
  operation_type,
  status
);

CREATE INDEX idx_cash_box_operations_created_at
ON cash_box_operations (
  created_at
);


/*
 * Validaciones antes de guardar
 * una operación.
 */
CREATE TRIGGER validate_cash_box_operation_insert

BEFORE INSERT
ON cash_box_operations

BEGIN

  /*
   * El operador debe ser una cajera activa.
   */
  SELECT
    CASE
      WHEN NOT EXISTS (
        SELECT
          1

        FROM app_users

        WHERE
          id = NEW.operator_user_id

          AND role = 'CAJERO'

          AND active = 1
      )

      THEN RAISE(
        ABORT,
        'INVALID_CASHIER'
      )
    END;


  /*
   * La sesión física debe estar:
   *
   * - abierta;
   * - confirmada;
   * - asignada a la cajera.
   */
  SELECT
    CASE
      WHEN NOT EXISTS (
        SELECT
          1

        FROM physical_register_sessions

        WHERE
          id =
            NEW.operator_physical_session_id

          AND responsible_user_id =
            NEW.operator_user_id

          AND status =
            'ABIERTA'

          AND cashier_confirmation_status =
            'CONFIRMADA'
      )

      THEN RAISE(
        ABORT,
        'INVALID_OPERATOR_REGISTER'
      )
    END;


  /*
   * En Servicios debe existir una
   * Caja Virtual abierta.
   */
  SELECT
    CASE
      WHEN
        NEW.operation_type =
          'SERVICIO'

        AND NOT EXISTS (
          SELECT
            1

          FROM virtual_account_sessions

          WHERE
            id =
              NEW.virtual_account_session_id

            AND status =
              'ABIERTA'
        )

      THEN RAISE(
        ABORT,
        'INVALID_VIRTUAL_SESSION'
      )
    END;


  /*
   * Para Servicios, la fecha comercial
   * de la cajera y de la Caja Virtual
   * debe ser la misma.
   */
  SELECT
    CASE
      WHEN
        NEW.operation_type =
          'SERVICIO'

        AND NOT EXISTS (
          SELECT
            1

          FROM physical_register_sessions
            AS physical_session

          INNER JOIN virtual_account_sessions
            AS virtual_session

            ON virtual_session.id =
               NEW.virtual_account_session_id

          WHERE
            physical_session.id =
              NEW.operator_physical_session_id

            AND physical_session.business_date =
                virtual_session.business_date
        )

      THEN RAISE(
        ABORT,
        'BUSINESS_DATE_MISMATCH'
      )
    END;

END;