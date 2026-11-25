CREATE TABLE phase7_roll_requests(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES phase7_campaigns(campaign_id),activity_id TEXT NOT NULL REFERENCES phase7_activities(id),state_json TEXT NOT NULL);
CREATE UNIQUE INDEX phase7_active_procedure ON phase7_roll_requests(activity_id,json_extract(state_json,'$.characterId'),json_extract(state_json,'$.procedure')) WHERE json_extract(state_json,'$.status')<>'superseded';
CREATE TABLE phase7_roll_bindings(roll_id TEXT PRIMARY KEY,request_id TEXT UNIQUE NOT NULL REFERENCES phase7_roll_requests(id),active INTEGER NOT NULL CHECK(active IN (0,1)));
CREATE TABLE phase7_roll_commands(campaign_id TEXT NOT NULL,operation_id TEXT NOT NULL,fingerprint TEXT NOT NULL,result_json TEXT NOT NULL,PRIMARY KEY(campaign_id,operation_id));
