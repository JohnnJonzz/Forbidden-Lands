-- Availability is a reference; applicability is a separate, campaign-scoped decision.
ALTER TABLE campaign_sourcebooks ADD COLUMN applicable INTEGER NOT NULL DEFAULT 1 CHECK(applicable IN (0,1));
CREATE TABLE campaign_curated_rules (
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 document_id TEXT NOT NULL REFERENCES curated_rules(id) ON DELETE CASCADE,
 active_override INTEGER NOT NULL DEFAULT 0 CHECK(active_override IN (0,1)),
 PRIMARY KEY(campaign_id,document_id)
);
CREATE VIEW available_curated_rules AS
 SELECT d.*,d.rowid AS rowid,d.campaign_id AS owner_campaign_id,1 AS applicable FROM curated_rules d
 UNION ALL
 SELECT d.id,l.campaign_id,d.title,d.topic,d.document_type,d.visibility,d.body,d.source_reference,d.override_scope,d.created_at,d.updated_at,d.revision,d.primary_topic,d.tags,d.description,d.rowid,d.campaign_id,
 CASE WHEN d.document_type='House Rule' THEN l.active_override ELSE 1 END
 FROM curated_rules d JOIN campaign_curated_rules l ON l.document_id=d.id WHERE l.campaign_id<>d.campaign_id;
CREATE VIEW applicable_curated_rules AS SELECT * FROM available_curated_rules WHERE applicable=1;
CREATE VIEW applicable_source_documents AS
 SELECT d.* FROM accessible_source_documents d
 WHERE NOT EXISTS(SELECT 1 FROM campaign_sourcebooks l WHERE l.campaign_id=d.campaign_id AND l.document_id=d.id AND l.applicable=0);
CREATE TABLE campaign_library_policy (
 campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id),
 mode TEXT NOT NULL CHECK(mode IN ('inherit','restricted'))
);
