-- Input, output, passport, and embedding tables

CREATE TABLE IF NOT EXISTS inputs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id    UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  material_class material_class,
  description    TEXT NOT NULL,
  specs          JSONB,
  quantity_kg    NUMERIC(12,2) NOT NULL,
  frequency      VARCHAR(50),
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outputs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id        UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  material_class     material_class,
  description        TEXT NOT NULL,
  composition        JSONB,
  quantity_kg        NUMERIC(12,2) NOT NULL,
  stock              NUMERIC(12,2) NOT NULL DEFAULT 0,
  availability       BOOLEAN NOT NULL DEFAULT TRUE,
  pending_review     BOOLEAN NOT NULL DEFAULT FALSE,
  embedding_pending  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMP DEFAULT NOW()
);

-- Vector embeddings table
CREATE TABLE IF NOT EXISTS embeddings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id      UUID NOT NULL,
  record_type    record_type NOT NULL,
  vector         VECTOR(768) NOT NULL,
  model_version  VARCHAR(100) NOT NULL,
  created_at     TIMESTAMP DEFAULT NOW(),
  UNIQUE (record_id, record_type)
);

CREATE TABLE IF NOT EXISTS material_passports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  output_id      UUID NOT NULL UNIQUE REFERENCES outputs(id) ON DELETE CASCADE,
  passport_data  JSONB NOT NULL,
  dpp_compliant  BOOLEAN NOT NULL DEFAULT FALSE,
  qr_code        VARCHAR(500),
  pdf_url        VARCHAR(500),
  created_at     TIMESTAMP DEFAULT NOW()
);
