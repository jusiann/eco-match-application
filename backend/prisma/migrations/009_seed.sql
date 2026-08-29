-- Initial configuration and reference seed data

INSERT INTO system_config (key, value, description) VALUES
  ('match.threshold',      '0.60'::jsonb, 'Cosine similarity lower threshold'),
  ('match.top_k',          '20'::jsonb,   'Candidate count before scoring'),
  ('match.top_n',          '10'::jsonb,   'Match count returned to user'),
  ('match.hitl_threshold', '0.80'::jsonb, 'Human-in-the-loop review threshold'),
  ('match.expiry_days',    '30'::jsonb,   'Match validity duration in days'),
  ('chat.daily_limit',     '50'::jsonb,   'Daily chatbot message limit per user')
ON CONFLICT (key) DO NOTHING;

-- Initial scoring weights (v1)
INSERT INTO weights_config (version, material, quality, environmental, logistics, economic, active)
SELECT 1, 0.30, 0.20, 0.20, 0.15, 0.15, TRUE
WHERE NOT EXISTS (SELECT 1 FROM weights_config WHERE version = 1);

-- Reference carbon factors
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
