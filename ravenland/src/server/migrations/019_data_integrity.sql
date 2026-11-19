-- Explicit opt-in sharing. Ownership, citations and physical assets stay stable.
CREATE TABLE shared_sourcebooks (
 document_id TEXT PRIMARY KEY REFERENCES source_documents(id) ON DELETE CASCADE
);
CREATE TABLE campaign_sourcebooks (
 campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
 document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
 PRIMARY KEY(campaign_id,document_id)
);
CREATE VIEW accessible_source_documents AS
 SELECT d.* FROM source_documents d
 UNION ALL
 SELECT d.id,l.campaign_id,d.title,d.original_filename,d.file_size,d.sha256,d.storage_key,d.page_count,d.processed_pages,d.uploaded_at,d.status,d.category,d.visibility,d.error_summary,d.revision,d.processing_started_at
 FROM source_documents d JOIN campaign_sourcebooks l ON l.document_id=d.id
 WHERE l.campaign_id<>d.campaign_id;
CREATE TABLE shared_images (
 image_id TEXT PRIMARY KEY REFERENCES image_assets(id),
 name TEXT NOT NULL,
 category TEXT NOT NULL
);
CREATE TABLE starting_villages (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 hex TEXT NOT NULL REFERENCES geography_hexes(coordinate),
 map_checksum TEXT NOT NULL,
 evidence TEXT NOT NULL,
 verified_at TEXT NOT NULL,
 UNIQUE(map_checksum,hex,name)
);
CREATE TABLE campaign_lifecycle_receipts (
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 request_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 result_json TEXT NOT NULL,
 PRIMARY KEY(campaign_id,request_id)
);
-- Retry tombstones contain no removed payload, context or historical content.
CREATE TABLE retired_campaign_requests (
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 request_id TEXT NOT NULL,
 kind TEXT NOT NULL,
 PRIMARY KEY(campaign_id,request_id,kind)
);
