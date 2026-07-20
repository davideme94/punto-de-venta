/*
 * EXTRACCIONES DE EFECTIVO CONTRA TRANSFERENCIA
 *
 * Ejemplo:
 *
 * El cliente recibe:      $5.000
 * Comisión del 3%:          $150
 * Total transferido:      $5.150
 *
 * El efectivo puede salir de:
 *
 * - la caja física asignada a la cajera;
 * - el fondo de la caja virtual.
 *
 * La transferencia siempre ingresa en
 * la sesión virtual abierta.
 */


/*
 * Contador correlativo para mostrar:
 *
 * Extracción N.º 1
 * Extracción N.º 2
 * etc.
 */
CREATE TABLE cash_withdrawal_counter (
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


/*
 * Registro principal de extracciones.
 */
CREATE TABLE cash_withdrawals (
  id TEXT PRIMARY KEY,

  operation_number INTEGER NOT NULL
    UNIQUE,

  /*
   * Cajera que realizó la operación.
   */
  operator_user_id TEXT NOT NULL,

  /*
   * Se completa solamente cuando el
   * efectivo sale de la caja física
   * asignada a la cajera.
   *
   * Si sale del fondo virtual queda NULL.
   */
  physical_register_session_id TEXT,

  /*
   * Sesión virtual donde se registra
   * la transferencia recibida.
   */
  virtual_account_session_id TEXT NOT NULL,

  /*
   * Origen de los billetes entregados:
   *
   * PHYSICAL_REGISTER
   * VIRTUAL_ACCOUNT
   */
  cash_source TEXT NOT NULL
    CHECK (
      cash_source IN (
        'PHYSICAL_REGISTER',
        'VIRTUAL_ACCOUNT'
      )
    ),

  /*
   * Dinero en efectivo entregado
   * al cliente.
   *
   * Ejemplo: $5.000 = 500000 centavos.
   */
  withdrawal_amount_cents INTEGER NOT NULL
    CHECK (
      withdrawal_amount_cents > 0
    ),

  /*
   * Porcentaje expresado en puntos base.
   *
   * 300 puntos base = 3%.
   */
  commission_rate_basis_points INTEGER NOT NULL
    DEFAULT 300
    CHECK (
      commission_rate_basis_points >= 0
    ),

  /*
   * Ganancia correspondiente a la comisión.
   *
   * Ejemplo:
   * 3% de $5.000 = $150.
   */
  commission_amount_cents INTEGER NOT NULL
    CHECK (
      commission_amount_cents >= 0
    ),

  /*
   * Total que el cliente transfirió.
   *
   * retiro + comisión.
   */
  transfer_total_cents INTEGER NOT NULL
    CHECK (
      transfer_total_cents > 0
    ),

  /*
   * Número de operación, nombre del titular
   * u otra referencia de la transferencia.
   */
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

  /*
   * El total transferido debe ser
   * exactamente retiro + comisión.
   */
  CHECK (
    transfer_total_cents =
      withdrawal_amount_cents +
      commission_amount_cents
  ),

  /*
   * Cuando el dinero sale de la caja física
   * debe existir una sesión física.
   *
   * Cuando sale del fondo virtual, la sesión
   * física debe quedar vacía.
   */
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

  /*
   * Una operación anulada debe guardar
   * fecha, usuario y motivo.
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
 * Índices para búsquedas y cierres.
 */
CREATE INDEX idx_cash_withdrawals_operator
ON cash_withdrawals (
  operator_user_id,
  created_at
);

CREATE INDEX idx_cash_withdrawals_physical_session
ON cash_withdrawals (
  physical_register_session_id,
  status
);

CREATE INDEX idx_cash_withdrawals_virtual_session
ON cash_withdrawals (
  virtual_account_session_id,
  status
);

CREATE INDEX idx_cash_withdrawals_created_at
ON cash_withdrawals (
  created_at
);


/*
 * Validaciones antes de crear una extracción.
 */
CREATE TRIGGER validate_cash_withdrawal_insert

BEFORE INSERT
ON cash_withdrawals

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
          id =
            NEW.operator_user_id

          AND role =
            'CAJERO'

          AND active = 1
      )

      THEN RAISE(
        ABORT,
        'INVALID_CASHIER'
      )
    END;


  /*
   * La cajera debe tener una caja física
   * abierta y confirmada, aunque el dinero
   * vaya a salir del fondo virtual.
   */
  SELECT
    CASE
      WHEN NOT EXISTS (
        SELECT
          1

        FROM physical_register_sessions

        WHERE
          responsible_user_id =
            NEW.operator_user_id

          AND status =
            'ABIERTA'

          AND cashier_confirmation_status =
            'CONFIRMADA'
      )

      THEN RAISE(
        ABORT,
        'CASHIER_WITHOUT_CONFIRMED_REGISTER'
      )
    END;


  /*
   * La sesión virtual debe estar abierta.
   */
  SELECT
    CASE
      WHEN NOT EXISTS (
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
        'INVALID_OR_CLOSED_VIRTUAL_SESSION'
      )
    END;


  /*
   * Cuando el efectivo sale de la caja
   * física, esa caja debe:
   *
   * - estar abierta;
   * - pertenecer a la cajera;
   * - estar confirmada.
   */
  SELECT
    CASE
      WHEN
        NEW.cash_source =
          'PHYSICAL_REGISTER'

        AND NOT EXISTS (
          SELECT
            1

          FROM physical_register_sessions

          WHERE
            id =
              NEW.physical_register_session_id

            AND responsible_user_id =
              NEW.operator_user_id

            AND status =
              'ABIERTA'

            AND cashier_confirmation_status =
              'CONFIRMADA'
        )

      THEN RAISE(
        ABORT,
        'INVALID_PHYSICAL_CASH_SOURCE'
      )
    END;


  /*
   * La fecha comercial de la caja física
   * y de la caja virtual debe coincidir.
   */
  SELECT
    CASE
      WHEN
        NEW.cash_source =
          'PHYSICAL_REGISTER'

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
              NEW.physical_register_session_id

            AND physical_session.business_date =
                virtual_session.business_date
        )

      THEN RAISE(
        ABORT,
        'REGISTER_BUSINESS_DATE_MISMATCH'
      )
    END;

END;