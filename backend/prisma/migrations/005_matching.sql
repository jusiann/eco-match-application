-- Matching tables. See docs/03-veri-modeli.md "Eşleştirme".
--
-- rejection_reason is split into category/text (K-07): the category is shown
-- to the counterparty (A1), the free text never is.
--
-- human_review_queue covers both a classification review (output_id, A2) and
-- a match review (match_id) -- one queue, two kinds of item (K-08).

CREATE TABLE IF NOT EXISTS matches (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  output_id                   UUID NOT NULL REFERENCES outputs(id) ON DELETE CASCADE,
  input_id                    UUID NOT NULL REFERENCES inputs(id) ON DELETE CASCADE,
  total_score                 INTEGER NOT NULL,
  breakdown                   JSONB NOT NULL, -- {material, quality, environmental, logistics, economic}
  status                      match_status NOT NULL DEFAULT 'pending',
  demand_qty                  NUMERIC(12,2),
  co2_saved                   NUMERIC(12,2),
  cost_saving                 NUMERIC(12,2),
  cbam_impact                 NUMERIC(12,2),
  rejection_reason_category   VARCHAR(50),
  rejection_reason_text       TEXT,
  accepted_by_supplier_at     TIMESTAMP,
  accepted_by_consumer_at     TIMESTAMP,
  expires_at                  TIMESTAMP NOT NULL,
  created_at                  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS human_review_queue (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  output_id      UUID REFERENCES outputs(id) ON DELETE CASCADE,
  match_id       UUID REFERENCES matches(id) ON DELETE CASCADE,
  confidence     NUMERIC(4,3) NOT NULL,
  reason         VARCHAR(255), -- 'low_classification_confidence' | 'low_match_confidence'
  ai_suggestion  JSONB, -- top-3 classes + confidence, shown to the expert
  status         review_status NOT NULL DEFAULT 'pending',
  reviewed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at    TIMESTAMP,
  notes          TEXT,
  created_at     TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_review_target CHECK (output_id IS NOT NULL OR match_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id     UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  report_type  report_type NOT NULL,
  data         JSONB NOT NULL, -- frozen at generation time, never retroactively changed (AD3)
  pdf_url      VARCHAR(500),
  created_at   TIMESTAMP DEFAULT NOW()
);
