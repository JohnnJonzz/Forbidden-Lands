-- Hidden camp mishaps are GM knowledge, outside exported/shared campaign state.
CREATE TABLE activity_private (
 campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
 assignment_id TEXT NOT NULL,
 state_json TEXT NOT NULL CHECK(json_valid(state_json)),
 PRIMARY KEY(campaign_id,assignment_id)
);
