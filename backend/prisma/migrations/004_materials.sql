-- Material tables. See docs/03-veri-modeli.md "Malzeme".

CREATE TABLE IF NOT EXISTS inputs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id    UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  material_class material_class, -- nullable while pending expert review (A2)
  description    TEXT NOT NULL,
  specs          JSONB,
  quantity_kg    NUMERIC(12,2) NOT NULL,
  frequency      VARCHAR(50), -- 'daily' | 'weekly' | 'monthly' | 'one_time'
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outputs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id        UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  material_class     material_class, -- nullable while pending_review = true (A2)
  description        TEXT NOT NULL,
  composition        JSONB, -- e.g. {"selüloz": 60, "su": 30, "diğer": 10}, should sum to 100 (E8)
  quantity_kg        NUMERIC(12,2) NOT NULL,
  stock              NUMERIC(12,2) NOT NULL DEFAULT 0,
  availability       BOOLEAN NOT NULL DEFAULT TRUE,
  pending_review     BOOLEAN NOT NULL DEFAULT FALSE,
  embedding_pending  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMP DEFAULT NOW()
);

-- Polymorphic: (record_id, record_type) points at an inputs or outputs row.
-- No FK -- see docs/03-veri-modeli.md for why. App code cleans up on delete.
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
  passport_data  JSONB NOT NULL, -- ESPR format, see docs/05-is-kurallari.md
  dpp_compliant  BOOLEAN NOT NULL DEFAULT FALSE,
  qr_code        VARCHAR(500),
  pdf_url        VARCHAR(500),
  created_at     TIMESTAMP DEFAULT NOW()
);
