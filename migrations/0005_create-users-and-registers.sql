/*
 * Usuarios del sistema.
 *
 * Incluye:
 * - Administrador.
 * - Las diez empleadas/cajeras.
 *
 * Los PIN se configurarán en el próximo paso.
 */
CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,

  username TEXT NOT NULL
    COLLATE NOCASE
    UNIQUE,

  display_name TEXT NOT NULL,

  role TEXT NOT NULL DEFAULT 'CAJERO'
    CHECK (
      role IN (
        'ADMIN',
        'CAJERO'
      )
    ),

  pin_hash TEXT,

  pin_salt TEXT,

  active INTEGER NOT NULL DEFAULT 1
    CHECK (
      active IN (0, 1)
    ),

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

/*
 * Las dos cajas físicas fijas.
 *
 * La cajera asignada no se guarda aquí.
 * Se guardará después en una sesión de caja,
 * porque las empleadas rotan.
 */
CREATE TABLE IF NOT EXISTS physical_registers (
  id TEXT PRIMARY KEY,

  code TEXT NOT NULL
    COLLATE NOCASE
    UNIQUE,

  name TEXT NOT NULL UNIQUE,

  active INTEGER NOT NULL DEFAULT 1
    CHECK (
      active IN (0, 1)
    ),

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

/*
 * Caja o saldo virtual compartido.
 *
 * Existe una sola caja virtual para todo
 * el negocio.
 */
CREATE TABLE IF NOT EXISTS virtual_accounts (
  id TEXT PRIMARY KEY,

  code TEXT NOT NULL
    COLLATE NOCASE
    UNIQUE,

  name TEXT NOT NULL UNIQUE,

  active INTEGER NOT NULL DEFAULT 1
    CHECK (
      active IN (0, 1)
    ),

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_users_active
ON app_users(active);

CREATE INDEX IF NOT EXISTS idx_app_users_role
ON app_users(role);

CREATE INDEX IF NOT EXISTS idx_physical_registers_active
ON physical_registers(active);

/*
 * Cuenta administrativa.
 *
 * Por ahora no tiene PIN.
 */
INSERT OR IGNORE INTO app_users (
  id,
  username,
  display_name,
  role
)
VALUES (
  'user-admin',
  'ADMINISTRADOR',
  'Administrador',
  'ADMIN'
);

/*
 * Empleadas.
 */
INSERT OR IGNORE INTO app_users (
  id,
  username,
  display_name,
  role
)
VALUES
  (
    'user-lidia',
    'LIDIA',
    'Lidia',
    'CAJERO'
  ),
  (
    'user-romina',
    'ROMINA',
    'Romina',
    'CAJERO'
  ),
  (
    'user-gaby',
    'GABY',
    'Gaby',
    'CAJERO'
  ),
  (
    'user-rocio',
    'ROCIO',
    'Rocio',
    'CAJERO'
  ),
  (
    'user-agus',
    'AGUS',
    'Agus',
    'CAJERO'
  ),
  (
    'user-ana',
    'ANA',
    'Ana',
    'CAJERO'
  ),
  (
    'user-erika',
    'ERIKA',
    'Erika',
    'CAJERO'
  ),
  (
    'user-brenda',
    'BRENDA',
    'Brenda',
    'CAJERO'
  ),
  (
    'user-ailen',
    'AILEN',
    'Ailen',
    'CAJERO'
  ),
  (
    'user-camila',
    'CAMILA',
    'Camila',
    'CAJERO'
  );

/*
 * Cajas físicas fijas.
 */
INSERT OR IGNORE INTO physical_registers (
  id,
  code,
  name
)
VALUES
  (
    'physical-register-1',
    'CAJA_1',
    'Caja Física 1'
  ),
  (
    'physical-register-2',
    'CAJA_2',
    'Caja Física 2'
  );

/*
 * Única caja virtual.
 */
INSERT OR IGNORE INTO virtual_accounts (
  id,
  code,
  name
)
VALUES (
  'virtual-account-main',
  'VIRTUAL_PRINCIPAL',
  'Caja Virtual'
);