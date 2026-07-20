ALTER TABLE app_users
ADD COLUMN password_hash TEXT;

ALTER TABLE app_users
ADD COLUMN password_salt TEXT;

ALTER TABLE app_users
ADD COLUMN password_updated_at TEXT;
