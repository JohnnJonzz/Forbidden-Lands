-- Coordination only: authoritative travel, dice, canon and time remain in their existing stores.
CREATE TABLE table_gm_settings(campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id),player_id TEXT NOT NULL,revision INTEGER NOT NULL,assigned_by TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE narrative_journeys(campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id),state_json TEXT NOT NULL);
CREATE TABLE narrative_receipts(campaign_id TEXT NOT NULL REFERENCES campaigns(id),request_id TEXT NOT NULL,actor_id TEXT NOT NULL,fingerprint TEXT NOT NULL,result_json TEXT NOT NULL,PRIMARY KEY(campaign_id,request_id));
CREATE TABLE narrative_events(campaign_id TEXT NOT NULL REFERENCES campaigns(id),id TEXT NOT NULL,journey_id TEXT NOT NULL,kind TEXT NOT NULL,actor_id TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(campaign_id,id));
