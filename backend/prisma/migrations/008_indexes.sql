-- Performance and vector search indexes (HNSW, GiST, B-Tree)

CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw ON embeddings
  USING hnsw (vector vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_facilities_location ON facilities USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_osbs_region        ON osbs       USING GIST (region);

CREATE INDEX IF NOT EXISTS idx_outputs_material_class ON outputs(material_class);
CREATE INDEX IF NOT EXISTS idx_inputs_material_class  ON inputs(material_class);
CREATE INDEX IF NOT EXISTS idx_outputs_facility       ON outputs(facility_id);
CREATE INDEX IF NOT EXISTS idx_inputs_facility        ON inputs(facility_id);
CREATE INDEX IF NOT EXISTS idx_matches_output         ON matches(output_id);
CREATE INDEX IF NOT EXISTS idx_matches_input          ON matches(input_id);
CREATE INDEX IF NOT EXISTS idx_matches_status         ON matches(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON notifications(user_id)      WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_review_pending    ON human_review_queue(status, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_api_keys_hash     ON api_keys(key_hash)          WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_carbon_active     ON carbon_factors(material_class, factor_type) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_entity      ON audit_log(entity, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_facility   ON sensor_data(facility_id, timestamp DESC);
