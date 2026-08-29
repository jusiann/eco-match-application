-- Seed data. See docs/03-veri-modeli.md and docs/05-is-kurallari.md "Sabitler".
-- Idempotent: safe to re-run.

INSERT INTO system_config (key, value, description) VALUES
  ('match.threshold',      '0.60'::jsonb, 'Cosine benzerlik alt eşiği'),
  ('match.top_k',          '20'::jsonb,   'Skorlama öncesi aday sayısı'),
  ('match.top_n',          '10'::jsonb,   'Kullanıcıya dönen eşleşme sayısı'),
  ('match.hitl_threshold', '0.80'::jsonb, 'Uzman onay tetik eşiği'),
  ('match.expiry_days',    '30'::jsonb,   'Eşleşme geçerlilik süresi (gün)'),
  ('chat.daily_limit',     '50'::jsonb,   'Kullanıcı başına günlük chatbot mesajı')
ON CONFLICT (key) DO NOTHING;

-- v1 scoring weights: material .30 / quality .20 / environmental .20 / logistics .15 / economic .15
INSERT INTO weights_config (version, material, quality, environmental, logistics, economic, active)
SELECT 1, 0.30, 0.20, 0.20, 0.15, 0.15, TRUE
WHERE NOT EXISTS (SELECT 1 FROM weights_config WHERE version = 1);

-- Reference carbon factors (Ecoinvent v3.10). Extend as new material classes are added (AD5).
INSERT INTO carbon_factors (material_class, factor_type, co2_per_kg, source, valid_from)
SELECT * FROM (VALUES
  ('organic'::material_class,  'virgin'::varchar,    1.8500::numeric, 'Ecoinvent v3.10'::varchar, DATE '2026-01-01'),
  ('organic',                  'secondary',          0.4200,          'Ecoinvent v3.10',          DATE '2026-01-01'),
  ('metal',                    'virgin',             2.3000,          'Ecoinvent v3.10',          DATE '2026-01-01'),
  ('metal',                    'secondary',          0.6500,          'Ecoinvent v3.10',          DATE '2026-01-01'),
  ('plastic',                  'virgin',             2.9000,          'Ecoinvent v3.10',          DATE '2026-01-01'),
  ('plastic',                  'secondary',          0.8500,          'Ecoinvent v3.10',          DATE '2026-01-01'),
  ('textile',                  'virgin',             3.1000,          'Ecoinvent v3.10',          DATE '2026-01-01'),
  ('textile',                  'secondary',          0.9000,          'Ecoinvent v3.10',          DATE '2026-01-01'),
  ('paper',                    'virgin',             1.1000,          'Ecoinvent v3.10',          DATE '2026-01-01'),
  ('paper',                    'secondary',          0.3000,          'Ecoinvent v3.10',          DATE '2026-01-01'),
  ('glass',                    'virgin',             0.8500,          'Ecoinvent v3.10',          DATE '2026-01-01'),
  ('glass',                    'secondary',          0.3500,          'Ecoinvent v3.10',          DATE '2026-01-01'),
  ('chemical',                 'virgin',             2.5000,          'Ecoinvent v3.10',          DATE '2026-01-01'),
  ('chemical',                 'secondary',          0.9500,          'Ecoinvent v3.10',          DATE '2026-01-01')
) AS seed(material_class, factor_type, co2_per_kg, source, valid_from)
WHERE NOT EXISTS (
  SELECT 1 FROM carbon_factors cf
   WHERE cf.material_class = seed.material_class
     AND cf.factor_type = seed.factor_type
     AND cf.valid_to IS NULL
);
