ALTER TABLE newsletters
  ADD COLUMN progress TEXT NOT NULL DEFAULT 'draft' CHECK (progress IN ('draft', 'ready', 'sent')),
  ADD COLUMN issue_date TEXT,
  ADD COLUMN source_newsletter_id UUID;

CREATE TABLE newsletter_sent_marks (
  id UUID PRIMARY KEY,
  newsletter_id UUID NOT NULL REFERENCES newsletters (id),
  save_version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  actor_id UUID NOT NULL REFERENCES users (id),
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX newsletter_sent_marks_newsletter_idx ON newsletter_sent_marks (newsletter_id, marked_at DESC);

CREATE TABLE newsletter_duplicate_receipts (
  source_newsletter_id UUID NOT NULL,
  client_request_id TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES users (id),
  created_newsletter_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_newsletter_id, client_request_id)
);

CREATE TABLE ai_usage_events (
  id UUID PRIMARY KEY,
  actor_id UUID NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_events_actor_idx ON ai_usage_events (actor_id, created_at DESC);

CREATE TABLE ai_inflight (
  actor_id UUID PRIMARY KEY REFERENCES users (id),
  request_token UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE newsletter_progress_receipts (
  newsletter_id UUID NOT NULL REFERENCES newsletters (id),
  actor_id UUID NOT NULL REFERENCES users (id),
  base_version INTEGER NOT NULL,
  progress TEXT NOT NULL CHECK (progress IN ('draft', 'ready', 'sent')),
  committed_version INTEGER NOT NULL,
  PRIMARY KEY (newsletter_id, actor_id, base_version)
);
