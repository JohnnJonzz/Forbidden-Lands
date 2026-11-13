CREATE TABLE campaigns (
 id TEXT PRIMARY KEY,
 revision INTEGER NOT NULL DEFAULT 1,
 public_state TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE application_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- GM-only data is deliberately outside public snapshots and backup exports.
CREATE TABLE campaign_secrets (campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id), secret_state TEXT NOT NULL);
