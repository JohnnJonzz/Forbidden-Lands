CREATE TABLE geography_hexes (coordinate TEXT PRIMARY KEY, public_data TEXT NOT NULL);
CREATE TABLE geography_edges (from_hex TEXT NOT NULL REFERENCES geography_hexes(coordinate), to_hex TEXT NOT NULL REFERENCES geography_hexes(coordinate), PRIMARY KEY(from_hex,to_hex));
CREATE TABLE geography_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
