-- Identity and facility tables. See docs/03-veri-modeli.md "Kimlik ve tesis".

CREATE TABLE IF NOT EXISTS osbs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  city       VARCHAR(100) NOT NULL,
  region     GEOGRAPHY(POLYGON, 4326),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS facilities (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  tax_id     VARCHAR(20) NOT NULL UNIQUE,
  sector     VARCHAR(150) NOT NULL,
  location   GEOGRAPHY(POINT, 4326), -- nullable: legacy/incomplete registrations (E6)
  osb_id     UUID REFERENCES osbs(id) ON DELETE SET NULL,
  verified   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id    UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  role           user_role NOT NULL DEFAULT 'user',
  contact_name   VARCHAR(150),
  phone          VARCHAR(30),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  refresh_token  VARCHAR(255),
  last_login     TIMESTAMP,
  created_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash   VARCHAR(255) NOT NULL UNIQUE,
  name       VARCHAR(100) NOT NULL,
  scopes     TEXT[] NOT NULL DEFAULT ARRAY['read'],
  last_used  TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS facility_verification (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id       UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  document_type     VARCHAR(50) NOT NULL, -- 'tax_certificate' | 'operating_permit'
  document_url      VARCHAR(500) NOT NULL,
  status            review_status NOT NULL DEFAULT 'pending',
  reviewed_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMP,
  rejection_reason  TEXT,
  created_at        TIMESTAMP DEFAULT NOW()
);
