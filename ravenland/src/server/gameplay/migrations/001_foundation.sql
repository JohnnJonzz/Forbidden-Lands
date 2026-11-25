-- Applied only by explicit Phase 7 profile creation, never by Phase 6 startup.
CREATE TABLE phase7_schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE phase7_campaigns(campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE, profile_id TEXT NOT NULL, baseline_commit TEXT NOT NULL, current_activity_id TEXT, enrolled_at TEXT NOT NULL);
CREATE TABLE phase7_activities(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES phase7_campaigns(campaign_id),state_json TEXT NOT NULL);
CREATE UNIQUE INDEX phase7_one_quarter ON phase7_activities(campaign_id,json_extract(state_json,'$.clockRef.date'),json_extract(state_json,'$.clockRef.quarter'),json_extract(state_json,'$.clockRef.hex'),COALESCE(json_extract(state_json,'$.clockRef.elapsedQuarters'),-1));
CREATE TABLE phase7_commands(campaign_id TEXT NOT NULL REFERENCES phase7_campaigns(campaign_id),operation_id TEXT NOT NULL,actor_id TEXT NOT NULL,fingerprint TEXT NOT NULL,result_json TEXT NOT NULL,PRIMARY KEY(campaign_id,operation_id));
CREATE TABLE phase7_events(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES phase7_campaigns(campaign_id),activity_id TEXT REFERENCES phase7_activities(id),kind TEXT NOT NULL,payload_json TEXT NOT NULL,actor_id TEXT NOT NULL,created_at TEXT NOT NULL);
