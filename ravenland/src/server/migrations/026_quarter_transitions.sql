CREATE TABLE quarter_transitions (
 campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 entry_id TEXT NOT NULL,
 completion_receipt TEXT NOT NULL,
 state_json TEXT NOT NULL,
 PRIMARY KEY(campaign_id,id),
 UNIQUE(campaign_id,entry_id)
);
