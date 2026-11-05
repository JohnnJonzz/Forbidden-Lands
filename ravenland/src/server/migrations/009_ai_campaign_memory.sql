-- AI data lives outside public campaign snapshots, keeping private memory out of
-- ordinary campaign reads/backups. Existing campaign and audit rows are untouched.
CREATE TABLE ai_campaign_config (
 campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id),
 settings TEXT NOT NULL,
 session_id TEXT NOT NULL,
 session_cursor TEXT NOT NULL,
 is_test INTEGER NOT NULL DEFAULT 0,
 source_campaign_id TEXT REFERENCES campaigns(id)
);
CREATE TABLE campaign_memories (
 id TEXT PRIMARY KEY,
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 entity_key TEXT NOT NULL,
 data TEXT NOT NULL,
 visibility TEXT NOT NULL CHECK(visibility IN ('Party Known','Character Specific','GM Only')),
 status TEXT NOT NULL CHECK(status IN ('proposed','approved','corrected','archived')),
 importance INTEGER NOT NULL CHECK(importance BETWEEN 1 AND 5),
 locked INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 1,
 target_memory_id TEXT REFERENCES campaign_memories(id),
 target_revision INTEGER,
 proposal_hash TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX memory_retrieval ON campaign_memories(campaign_id,visibility,status,importance);
CREATE UNIQUE INDEX memory_proposal_dedup ON campaign_memories(campaign_id,proposal_hash) WHERE proposal_hash IS NOT NULL;
CREATE UNIQUE INDEX memory_canonical_fact ON campaign_memories(campaign_id,entity_key) WHERE status IN ('approved','corrected');
CREATE TABLE memory_history (
 id TEXT PRIMARY KEY,
 memory_id TEXT NOT NULL REFERENCES campaign_memories(id),
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 snapshot TEXT NOT NULL,
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE ai_requests (
 id TEXT NOT NULL,
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 kind TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 status TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 1,
 payload TEXT NOT NULL,
 context_json TEXT,
 response_json TEXT,
 error_code TEXT,
 started_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(campaign_id,id)
);
CREATE TABLE ai_usage (
 id TEXT PRIMARY KEY,
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 request_id TEXT NOT NULL,
 provider TEXT NOT NULL,
 model TEXT NOT NULL,
 input_tokens INTEGER,
 output_tokens INTEGER,
 estimated_usd REAL,
 error_code TEXT,
 created_at TEXT NOT NULL
);
CREATE TABLE ai_recaps (
 id TEXT PRIMARY KEY,
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 session_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 text TEXT NOT NULL,
 capture_end TEXT NOT NULL,
 journal_entry_id TEXT,
 revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 UNIQUE(campaign_id,session_id)
);
CREATE TABLE ai_scene_images (
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 image_id TEXT NOT NULL REFERENCES image_assets(id),
 PRIMARY KEY(campaign_id,image_id)
);
CREATE TABLE ai_action_receipts (
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 request_id TEXT NOT NULL,
 action_index INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(campaign_id,request_id,action_index)
);
