-- Remove foreign key constraint to preserve audit logs after user deletion
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_actor_id_fkey;
