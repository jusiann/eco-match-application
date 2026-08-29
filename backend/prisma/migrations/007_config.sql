-- System config, weights, and carbon factor tables

CREATE TABLE IF NOT EXISTS system_config (
  key         VARCHAR(100) PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMP DEFAULT NOW(),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS weights_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version       INTEGER NOT NULL,
  material      NUMERIC(4,3) NOT NULL CHECK (material BETWEEN 0 AND 1),
  quality       NUMERIC(4,3) NOT NULL CHECK (quality BETWEEN 0 AND 1),
  environmental NUMERIC(4,3) NOT NULL CHECK (environmental BETWEEN 0 AND 1),
  logistics     NUMERIC(4,3) NOT NULL CHECK (logistics BETWEEN 0 AND 1),
  economic      NUMERIC(4,3) NOT NULL CHECK (economic BETWEEN 0 AND 1),
  active        BOOLEAN NOT NULL DEFAULT FALSE,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_weights_sum CHECK (ROUND(material + quality + environmental + logistics + economic, 3) = 1.000)
);

-- Only one active weights configuration allowed at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_weights_active ON weights_config(active) WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS carbon_factors (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_class material_class NOT NULL,
  factor_type    VARCHAR(20) NOT NULL,
  co2_per_kg     NUMERIC(10,4) NOT NULL,
  source         VARCHAR(255) NOT NULL,
  valid_from     DATE NOT NULL,
  valid_to       DATE,
  created_at     TIMESTAMP DEFAULT NOW()
);
