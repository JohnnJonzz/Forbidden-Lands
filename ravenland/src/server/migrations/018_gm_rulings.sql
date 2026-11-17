-- Decisions/holds reference existing actions and consequences; no second campaign timeline.
CREATE TABLE gm_rulings (
 id TEXT PRIMARY KEY,
 campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
 scene_id TEXT,
 origin_id TEXT NOT NULL,
 domain TEXT NOT NULL,
 status TEXT NOT NULL,
 revision INTEGER NOT NULL,
 state_json TEXT NOT NULL CHECK(json_valid(state_json)),
 updated_at TEXT NOT NULL
);
CREATE INDEX ruling_origin ON gm_rulings(campaign_id,origin_id,status);
CREATE TABLE gm_policy (
 campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
 routine_ai INTEGER NOT NULL DEFAULT 1 CHECK(routine_ai IN (0,1))
);
