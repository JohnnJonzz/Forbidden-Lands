-- Explicit, additive upgrade. No campaign snapshot is changed or inferred here.
CREATE TABLE phase7_test_runs(campaign_id TEXT PRIMARY KEY REFERENCES phase7_campaigns(campaign_id),run_id TEXT NOT NULL,checkpoint_json TEXT,created_at TEXT NOT NULL);
CREATE TABLE phase7_test_archives(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES phase7_campaigns(campaign_id),run_id TEXT NOT NULL,kind TEXT NOT NULL,snapshot_json TEXT NOT NULL,actor_id TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE phase7_test_commands(campaign_id TEXT NOT NULL,operation_id TEXT NOT NULL,fingerprint TEXT NOT NULL,result_json TEXT NOT NULL,PRIMARY KEY(campaign_id,operation_id));
-- Historical quarters remain immutable; the current pointer is the active authority.
-- A reset creates a new run, never deletes/recycles an old activity ID.
DROP INDEX phase7_one_quarter;
CREATE TABLE phase7_conversations(campaign_id TEXT NOT NULL,operation_id TEXT NOT NULL,run_id TEXT NOT NULL,fingerprint TEXT NOT NULL,status TEXT NOT NULL,result_json TEXT,started_at TEXT NOT NULL,PRIMARY KEY(campaign_id,operation_id));
