CREATE TABLE calendar_corrections (
 campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL, fingerprint TEXT NOT NULL, actor_id TEXT NOT NULL,
 category TEXT NOT NULL, reason TEXT NOT NULL, before_json TEXT NOT NULL,
 after_json TEXT NOT NULL, impact_json TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(campaign_id,request_id)
);
