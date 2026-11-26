-- References point to existing authoritative records; no injury, character or roll copies.
CREATE TABLE campaign_consequences (
 id TEXT PRIMARY KEY,
 campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
 source_kind TEXT NOT NULL,
 source_id TEXT NOT NULL,
 category TEXT NOT NULL,
 status TEXT NOT NULL,
 revision INTEGER NOT NULL,
 state_json TEXT NOT NULL CHECK(json_valid(state_json)),
 updated_at TEXT NOT NULL,
 UNIQUE(campaign_id,source_kind,source_id,category)
);
CREATE INDEX consequence_open_campaign ON campaign_consequences(campaign_id,status);
CREATE TABLE consequence_commands (
 campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 created_at TEXT NOT NULL,
 PRIMARY KEY(campaign_id,request_id)
);
