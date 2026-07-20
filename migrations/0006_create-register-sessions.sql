/*
 * SESIONES DE CAJAS FÍSICAS
 *
 * Cada registro representa el período durante
 * el cual una empleada es responsable de una
 * de las dos cajas físicas.
 */
CREATE TABLE IF NOT EXISTS physical_register_sessions (
  id TEXT PRIMARY KEY,

  register_id TEXT NOT NULL,

  responsible_user_id TEXT NOT NULL,

  /*
   * Día comercial local en Argentina.
   * Formato: AAAA-MM-DD
   */
  business_date TEXT NOT NULL
    CHECK (
      LENGTH(business_date) = 10
    ),

  opening_amount_cents INTEGER NOT NULL
    CHECK (
      opening_amount_cents >= 0
    ),

  status TEXT NOT NULL DEFAULT 'ABIERTA'
    CHECK (
      status IN (
        'ABIERTA',
        'CERRADA',
        'ANULADA'
      )
    ),

  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  opened_by_user_id TEXT NOT NULL,

  opening_notes TEXT,

  expected_closing_amount_cents INTEGER
    CHECK (
      expected_closing_amount_cents IS NULL
      OR expected_closing_amount_cents >= 0
    ),

  counted_closing_amount_cents INTEGER
    CHECK (
      counted_closing_amount_cents IS NULL
      OR counted_closing_amount_cents >= 0
    ),

  /*
   * Puede ser positivo, negativo o cero.
   *
   * Ejemplo:
   * esperado: 100.000
   * contado:   99.000
   * diferencia: -1.000
   */
  difference_cents INTEGER,

  closed_at TEXT,

  closed_by_user_id TEXT,

  closing_notes TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (register_id)
    REFERENCES physical_registers(id),

  FOREIGN KEY (responsible_user_id)
    REFERENCES app_users(id),

  FOREIGN KEY (opened_by_user_id)
    REFERENCES app_users(id),

  FOREIGN KEY (closed_by_user_id)
    REFERENCES app_users(id),

  CHECK (
    status <> 'CERRADA'
    OR (
      expected_closing_amount_cents IS NOT NULL
      AND counted_closing_amount_cents IS NOT NULL
      AND difference_cents IS NOT NULL
      AND closed_at IS NOT NULL
      AND closed_by_user_id IS NOT NULL
    )
  )
);

/*
 * SESIONES DE LA CAJA VIRTUAL
 *
 * La caja virtual es única y compartida.
 * No tiene una cajera responsable exclusiva.
 */
CREATE TABLE IF NOT EXISTS virtual_account_sessions (
  id TEXT PRIMARY KEY,

  virtual_account_id TEXT NOT NULL,

  business_date TEXT NOT NULL
    CHECK (
      LENGTH(business_date) = 10
    ),

  opening_balance_cents INTEGER NOT NULL
    CHECK (
      opening_balance_cents >= 0
    ),

  status TEXT NOT NULL DEFAULT 'ABIERTA'
    CHECK (
      status IN (
        'ABIERTA',
        'CERRADA',
        'ANULADA'
      )
    ),

  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  opened_by_user_id TEXT NOT NULL,

  opening_notes TEXT,

  expected_closing_balance_cents INTEGER
    CHECK (
      expected_closing_balance_cents IS NULL
      OR expected_closing_balance_cents >= 0
    ),

  counted_closing_balance_cents INTEGER
    CHECK (
      counted_closing_balance_cents IS NULL
      OR counted_closing_balance_cents >= 0
    ),

  difference_cents INTEGER,

  closed_at TEXT,

  closed_by_user_id TEXT,

  closing_notes TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (virtual_account_id)
    REFERENCES virtual_accounts(id),

  FOREIGN KEY (opened_by_user_id)
    REFERENCES app_users(id),

  FOREIGN KEY (closed_by_user_id)
    REFERENCES app_users(id),

  CHECK (
    status <> 'CERRADA'
    OR (
      expected_closing_balance_cents IS NOT NULL
      AND counted_closing_balance_cents IS NOT NULL
      AND difference_cents IS NOT NULL
      AND closed_at IS NOT NULL
      AND closed_by_user_id IS NOT NULL
    )
  )
);

/*
 * Solo puede existir una sesión ABIERTA
 * para cada caja física.
 */
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_session_per_register
ON physical_register_sessions(register_id)
WHERE status = 'ABIERTA';

/*
 * Una empleada no puede estar asignada
 * simultáneamente a las dos cajas físicas.
 */
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_session_per_user
ON physical_register_sessions(responsible_user_id)
WHERE status = 'ABIERTA';

/*
 * Solo puede existir una sesión abierta
 * para la única Caja Virtual.
 */
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_virtual_session
ON virtual_account_sessions(virtual_account_id)
WHERE status = 'ABIERTA';

/*
 * Índices para informes y búsquedas.
 */
CREATE INDEX IF NOT EXISTS idx_physical_sessions_business_date
ON physical_register_sessions(business_date);

CREATE INDEX IF NOT EXISTS idx_physical_sessions_responsible_user
ON physical_register_sessions(responsible_user_id);

CREATE INDEX IF NOT EXISTS idx_physical_sessions_register
ON physical_register_sessions(register_id);

CREATE INDEX IF NOT EXISTS idx_physical_sessions_status
ON physical_register_sessions(status);

CREATE INDEX IF NOT EXISTS idx_virtual_sessions_business_date
ON virtual_account_sessions(business_date);

CREATE INDEX IF NOT EXISTS idx_virtual_sessions_status
ON virtual_account_sessions(status);