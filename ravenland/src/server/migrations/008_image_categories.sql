-- Preserve all asset IDs and campaign memberships while expanding categories.
ALTER TABLE campaign_images RENAME TO campaign_images_previous;
CREATE TABLE campaign_images (
 campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
 image_id TEXT NOT NULL REFERENCES image_assets(id),
 name TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('Terrain','Player Character','NPC','Creature','Location','Scene')),
 PRIMARY KEY(campaign_id,image_id)
);
INSERT INTO campaign_images SELECT campaign_id,image_id,name,category FROM campaign_images_previous;
DROP TABLE campaign_images_previous;
