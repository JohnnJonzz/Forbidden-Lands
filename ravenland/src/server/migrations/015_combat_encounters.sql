-- Encounter-scoped GM state stays outside public campaign snapshots/sourcebooks.
CREATE TABLE combat_encounters (
 id TEXT PRIMARY KEY,
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 status TEXT NOT NULL CHECK(status IN ('active','ended')),
 revision INTEGER NOT NULL,
 state_json TEXT NOT NULL CHECK(json_valid(state_json)),
 updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX combat_one_active ON combat_encounters(campaign_id) WHERE status='active';
CREATE TABLE combat_commands (
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 request_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 encounter_id TEXT NOT NULL REFERENCES combat_encounters(id),
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 created_at TEXT NOT NULL,
 PRIMARY KEY(campaign_id,request_id)
);
