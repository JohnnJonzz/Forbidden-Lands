CREATE TABLE journey_actions (
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 action_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(campaign_id,action_id)
);
