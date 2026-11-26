-- NULL means the maintained default instructions. Existing campaigns and canon remain unchanged.
ALTER TABLE ai_campaign_config ADD COLUMN gm_instructions TEXT;
ALTER TABLE ai_campaign_config ADD COLUMN instructions_updated_at TEXT;
ALTER TABLE ai_campaign_config ADD COLUMN instructions_revision INTEGER NOT NULL DEFAULT 0;
