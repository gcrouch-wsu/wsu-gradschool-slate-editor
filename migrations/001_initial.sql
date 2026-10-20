CREATE TABLE users (
  id UUID PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('administrator', 'editor')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  authorization_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_identities (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id),
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);

CREATE INDEX user_identities_user_id_idx ON user_identities (user_id);

CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users (id),
  authorization_version INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE newsletters (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  template TEXT NOT NULL,
  content JSONB NOT NULL,
  document_schema_version INTEGER NOT NULL,
  save_version INTEGER NOT NULL,
  archived_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users (id),
  updated_by UUID NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_token_hash TEXT,
  lease_holder_user_id UUID REFERENCES users (id),
  lease_expires_at TIMESTAMPTZ,
  last_save_id TEXT
);

CREATE INDEX newsletters_updated_at_idx ON newsletters (updated_at DESC);
CREATE INDEX newsletters_lease_idx ON newsletters (lease_holder_user_id, lease_expires_at);

CREATE TABLE newsletter_revisions (
  id UUID PRIMARY KEY,
  newsletter_id UUID NOT NULL REFERENCES newsletters (id),
  revision_number INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  actor_id UUID NOT NULL REFERENCES users (id),
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (newsletter_id, revision_number)
);

CREATE TABLE newsletter_save_receipts (
  id UUID PRIMARY KEY,
  newsletter_id UUID NOT NULL REFERENCES newsletters (id),
  client_save_id TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES users (id),
  base_version INTEGER NOT NULL,
  request_fingerprint TEXT NOT NULL,
  committed_version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (newsletter_id, client_save_id)
);

CREATE INDEX newsletter_save_receipts_created_idx ON newsletter_save_receipts (created_at);

CREATE TABLE newsletter_recovery_drafts (
  newsletter_id UUID NOT NULL REFERENCES newsletters (id),
  user_id UUID NOT NULL REFERENCES users (id),
  snapshot JSONB NOT NULL,
  base_version INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (newsletter_id, user_id)
);
