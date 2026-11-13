-- A clarification is a durable action proposal, not the latest chat context.
CREATE TABLE combat_setup_proposals (
 id TEXT PRIMARY KEY,
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 character_id TEXT NOT NULL,
 origin_request_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','resumed','cancelled','superseded')),
 revision INTEGER NOT NULL,
 proposal_json TEXT NOT NULL CHECK(json_valid(proposal_json)),
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 encounter_id TEXT REFERENCES combat_encounters(id),
 resolved_request_id TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX combat_setup_one_pending ON combat_setup_proposals(campaign_id,character_id) WHERE status='pending';
CREATE TABLE combat_setup_actions (
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 request_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 proposal_id TEXT REFERENCES combat_setup_proposals(id),
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 created_at TEXT NOT NULL,
 PRIMARY KEY(campaign_id,request_id)
);
