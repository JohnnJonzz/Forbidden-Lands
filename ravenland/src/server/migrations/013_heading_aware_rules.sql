-- Only derived sections/index metadata change. Original rule/PDF records remain intact.
ALTER TABLE curated_rule_sections ADD COLUMN heading_path TEXT NOT NULL DEFAULT '[]';
ALTER TABLE curated_rule_sections ADD COLUMN section_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE curated_rule_sections ADD COLUMN chunk_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE curated_rule_sections ADD COLUMN start_offset INTEGER NOT NULL DEFAULT 0;
ALTER TABLE curated_rule_sections ADD COLUMN end_offset INTEGER NOT NULL DEFAULT 0;
ALTER TABLE curated_rule_sections ADD COLUMN mechanical_topics TEXT NOT NULL DEFAULT '[]';
DROP TRIGGER curated_rule_insert;
DROP TRIGGER curated_rule_delete;
DROP TRIGGER curated_rule_update;
DROP TABLE curated_rule_search;
CREATE VIRTUAL TABLE curated_rule_search USING fts5(title,topic,text,source_reference,heading_path,content='curated_rule_sections',content_rowid='rowid',tokenize='porter unicode61');
CREATE TRIGGER curated_rule_insert AFTER INSERT ON curated_rule_sections BEGIN
 INSERT INTO curated_rule_search(rowid,title,topic,text,source_reference,heading_path) VALUES(new.rowid,new.title,new.topic,new.text,new.source_reference,new.heading_path);
END;
CREATE TRIGGER curated_rule_delete AFTER DELETE ON curated_rule_sections BEGIN
 INSERT INTO curated_rule_search(curated_rule_search,rowid,title,topic,text,source_reference,heading_path) VALUES('delete',old.rowid,old.title,old.topic,old.text,old.source_reference,old.heading_path);
END;
CREATE TRIGGER curated_rule_update AFTER UPDATE ON curated_rule_sections BEGIN
 INSERT INTO curated_rule_search(curated_rule_search,rowid,title,topic,text,source_reference,heading_path) VALUES('delete',old.rowid,old.title,old.topic,old.text,old.source_reference,old.heading_path);
 INSERT INTO curated_rule_search(rowid,title,topic,text,source_reference,heading_path) VALUES(new.rowid,new.title,new.topic,new.text,new.source_reference,new.heading_path);
END;
-- The existing migrator transaction calls the shared TypeScript indexer before recording 013.
-- Seed the replacement external-content index before backfill deletes old sections;
-- FTS delete triggers must see matching indexed rows during the transaction.
INSERT INTO curated_rule_search(curated_rule_search) VALUES ('rebuild');
