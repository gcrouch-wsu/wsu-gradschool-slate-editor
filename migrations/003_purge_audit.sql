CREATE TABLE newsletter_purge_events (
  id UUID PRIMARY KEY,
  newsletter_id UUID NOT NULL,
  title TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES users (id),
  purged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX newsletter_purge_events_purged_at_idx ON newsletter_purge_events (purged_at DESC);
