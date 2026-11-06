-- Campaign-scoped private documents. No campaign snapshots or canon are rewritten.
CREATE TABLE source_documents (
 id TEXT PRIMARY KEY,
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 title TEXT NOT NULL,
 original_filename TEXT NOT NULL,
 file_size INTEGER NOT NULL,
 sha256 TEXT NOT NULL,
 storage_key TEXT NOT NULL UNIQUE,
 page_count INTEGER,
 processed_pages INTEGER NOT NULL DEFAULT 0,
 uploaded_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('Uploaded','Processing','Indexed','Failed')),
 category TEXT NOT NULL,
 visibility TEXT NOT NULL DEFAULT 'GM Only' CHECK(visibility IN ('Public Rules','GM Only')),
 error_summary TEXT,
 revision INTEGER NOT NULL DEFAULT 1,
 processing_started_at TEXT,
 UNIQUE(campaign_id,sha256)
);
CREATE INDEX source_documents_campaign ON source_documents(campaign_id,status,visibility,category);
CREATE TABLE source_chunks (
 id TEXT NOT NULL UNIQUE,
 document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
 sequence INTEGER NOT NULL,
 start_page INTEGER NOT NULL,
 end_page INTEGER NOT NULL,
 text TEXT NOT NULL,
 heading TEXT,
 UNIQUE(document_id,sequence)
);
CREATE VIRTUAL TABLE source_search USING fts5(text, content='source_chunks', content_rowid='rowid', tokenize='porter unicode61');
CREATE TRIGGER source_chunks_insert AFTER INSERT ON source_chunks BEGIN
 INSERT INTO source_search(rowid,text) VALUES (new.rowid,new.text);
END;
CREATE TRIGGER source_chunks_delete AFTER DELETE ON source_chunks BEGIN
 INSERT INTO source_search(source_search,rowid,text) VALUES ('delete',old.rowid,old.text);
END;
CREATE TRIGGER source_chunks_update AFTER UPDATE ON source_chunks BEGIN
 INSERT INTO source_search(source_search,rowid,text) VALUES ('delete',old.rowid,old.text);
 INSERT INTO source_search(rowid,text) VALUES (new.rowid,new.text);
END;
