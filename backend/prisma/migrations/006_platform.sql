-- Platform tables. See docs/03-veri-modeli.md "Platform".
--
-- notifications.type is VARCHAR, not an enum (K-12): new notification types are
-- an application-level concern, not a schema-level one -- adding one should
-- never require a migration.

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(50) NOT NULL,
  title      VARCHAR(255) NOT NULL,
  body       TEXT,
  payload    JSONB, -- e.g. {match_id, route}
  read_at    TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type     VARCHAR(50) NOT NULL,
  in_app   BOOLEAN NOT NULL DEFAULT TRUE,
  email    BOOLEAN NOT NULL DEFAULT FALSE,
  push     BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, type)
);

CREATE TABLE IF NOT EXISTS messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       chat_role NOT NULL,
  content    TEXT NOT NULL,
  token_cost INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sensor_data (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  output_id   UUID REFERENCES outputs(id) ON DELETE SET NULL,
  sensor_type VARCHAR(50) NOT NULL,
  value       NUMERIC(12,4) NOT NULL,
  unit        VARCHAR(20) NOT NULL,
  timestamp   TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(50) NOT NULL, -- create, update, delete, accept, reject, verify, activate
  entity     VARCHAR(50) NOT NULL, -- output, match, facility, weights_config, ...
  entity_id  UUID NOT NULL,
  before     JSONB,
  after      JSONB,
  ip_address INET,
  created_at TIMESTAMP DEFAULT NOW()
);
