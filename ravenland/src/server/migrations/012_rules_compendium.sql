-- Additive curated library; existing PDFs and campaign canon remain untouched.
CREATE TABLE curated_rules (
 id TEXT PRIMARY KEY,
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 title TEXT NOT NULL,
 topic TEXT NOT NULL,
 document_type TEXT NOT NULL CHECK(document_type IN ('Official Rules Summary','House Rule')),
 visibility TEXT NOT NULL DEFAULT 'GM Only' CHECK(visibility IN ('Player Visible','GM Only')),
 body TEXT NOT NULL,
 source_reference TEXT NOT NULL DEFAULT '',
 override_scope TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX curated_rules_campaign ON curated_rules(campaign_id,visibility,topic);
CREATE TABLE curated_rule_sections (
 id TEXT NOT NULL UNIQUE,
 document_id TEXT NOT NULL REFERENCES curated_rules(id) ON DELETE CASCADE,
 sequence INTEGER NOT NULL,
 title TEXT NOT NULL,
 topic TEXT NOT NULL,
 text TEXT NOT NULL,
 source_reference TEXT NOT NULL,
 heading TEXT,
 UNIQUE(document_id,sequence)
);
CREATE VIRTUAL TABLE curated_rule_search USING fts5(title,topic,text,source_reference,content='curated_rule_sections',content_rowid='rowid',tokenize='porter unicode61');
CREATE TRIGGER curated_rule_insert AFTER INSERT ON curated_rule_sections BEGIN
 INSERT INTO curated_rule_search(rowid,title,topic,text,source_reference) VALUES(new.rowid,new.title,new.topic,new.text,new.source_reference);
END;
CREATE TRIGGER curated_rule_delete AFTER DELETE ON curated_rule_sections BEGIN
 INSERT INTO curated_rule_search(curated_rule_search,rowid,title,topic,text,source_reference) VALUES('delete',old.rowid,old.title,old.topic,old.text,old.source_reference);
END;
CREATE TRIGGER curated_rule_update AFTER UPDATE ON curated_rule_sections BEGIN
 INSERT INTO curated_rule_search(curated_rule_search,rowid,title,topic,text,source_reference) VALUES('delete',old.rowid,old.title,old.topic,old.text,old.source_reference);
 INSERT INTO curated_rule_search(rowid,title,topic,text,source_reference) VALUES(new.rowid,new.title,new.topic,new.text,new.source_reference);
END;
