-- Faz 1 oncesi sema duzeltmeleri: outputs.frequency (inputs ile simetrik) ve
-- matches.rejection_reason_category icin CHECK constraint (bkz. 09-kararlar.md K-17)

ALTER TABLE outputs ADD COLUMN IF NOT EXISTS frequency VARCHAR(50);

ALTER TABLE matches ADD CONSTRAINT chk_rejection_category
  CHECK (rejection_reason_category IS NULL OR rejection_reason_category IN (
    'distance_too_far', 'quantity_mismatch', 'quality_insufficient',
    'price_too_low', 'timing_unsuitable', 'other'
  ));
