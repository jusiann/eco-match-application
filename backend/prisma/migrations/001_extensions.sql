-- Extensions required by the schema. See docs/03-veri-modeli.md.
-- pgcrypto  -> gen_random_uuid() for primary keys
-- vector    -> pgvector, VECTOR(768) columns + HNSW index
-- postgis   -> GEOGRAPHY columns, ST_Distance for logistics scoring

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS postgis;
