CREATE TABLE image_assets (
 id TEXT PRIMARY KEY,
 width INTEGER NOT NULL,
 height INTEGER NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE campaign_images (
 campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
 image_id TEXT NOT NULL REFERENCES image_assets(id),
 name TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category='Player Character'),
 PRIMARY KEY(campaign_id,image_id)
);
