ALTER TABLE users ADD COLUMN password_hash TEXT;

CREATE UNIQUE INDEX users_local_email_unique
  ON users (lower(email))
  WHERE password_hash IS NOT NULL AND email IS NOT NULL;
