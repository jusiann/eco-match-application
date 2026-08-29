-- System enum types

CREATE TYPE user_role AS ENUM (
  'user',
  'facility_admin',
  'expert',
  'osb_manager',
  'admin'
);

CREATE TYPE material_class AS ENUM (
  'metal',
  'plastic',
  'organic',
  'chemical',
  'textile',
  'glass',
  'paper',
  'other'
);

CREATE TYPE record_type AS ENUM (
  'input',
  'output'
);

CREATE TYPE match_status AS ENUM (
  'pending',
  'accepted',
  'rejected',
  'completed',
  'expired'
);

CREATE TYPE report_type AS ENUM (
  'environmental',
  'cbam',
  'dpp'
);

CREATE TYPE chat_role AS ENUM (
  'user',
  'assistant'
);

CREATE TYPE review_status AS ENUM (
  'pending',
  'approved',
  'rejected'
);
