/*
 * CONTRASEÑA ADMINISTRATIVA
 *
 * La contraseña original nunca se guarda.
 * Solo se almacenan:
 *
 * - un hash seguro;
 * - una sal aleatoria;
 * - la fecha de modificación.
 */

ALTER TABLE app_users
ADD COLUMN password_hash TEXT;

ALTER TABLE app_users
ADD COLUMN password_salt TEXT;

ALTER TABLE app_users
ADD COLUMN password_updated_at TEXT;