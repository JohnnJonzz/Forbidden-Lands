-- Additive document metadata. Bodies, IDs, section IDs, permissions and authority are unchanged.
ALTER TABLE curated_rules ADD COLUMN primary_topic TEXT NOT NULL DEFAULT '';
ALTER TABLE curated_rules ADD COLUMN tags TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags) AND json_type(tags)='array');
ALTER TABLE curated_rules ADD COLUMN description TEXT NOT NULL DEFAULT '';
CREATE VIRTUAL TABLE curated_rule_metadata_search USING fts5(title,primary_topic,tags,description,content='curated_rules',content_rowid='rowid',tokenize='porter unicode61');
CREATE TRIGGER curated_metadata_insert AFTER INSERT ON curated_rules BEGIN
 INSERT INTO curated_rule_metadata_search(rowid,title,primary_topic,tags,description) VALUES(new.rowid,new.title,new.primary_topic,new.tags,new.description);
END;
CREATE TRIGGER curated_metadata_delete AFTER DELETE ON curated_rules BEGIN
 INSERT INTO curated_rule_metadata_search(curated_rule_metadata_search,rowid,title,primary_topic,tags,description) VALUES('delete',old.rowid,old.title,old.primary_topic,old.tags,old.description);
END;
CREATE TRIGGER curated_metadata_update AFTER UPDATE ON curated_rules BEGIN
 INSERT INTO curated_rule_metadata_search(curated_rule_metadata_search,rowid,title,primary_topic,tags,description) VALUES('delete',old.rowid,old.title,old.primary_topic,old.tags,old.description);
 INSERT INTO curated_rule_metadata_search(rowid,title,primary_topic,tags,description) VALUES(new.rowid,new.title,new.primary_topic,new.tags,new.description);
END;
INSERT INTO curated_rule_metadata_search(curated_rule_metadata_search) VALUES('rebuild');
