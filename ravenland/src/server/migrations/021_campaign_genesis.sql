-- Absence means legacy campaign: never force an existing adventure into Session Zero.
CREATE TABLE campaign_genesis (
 campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id),
 revision INTEGER NOT NULL,
 state_json TEXT NOT NULL
);
CREATE TABLE genesis_receipts (
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 request_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 response_json TEXT NOT NULL,
 PRIMARY KEY(campaign_id,request_id)
);
