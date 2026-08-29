-- audit_log.actor_id must not have an enforced FK to users(id).
--
-- Found via delete-account: a user deleting their own facility cascades to
-- delete that same user row (users.facility_id ON DELETE CASCADE). The audit
-- write for the 'delete' action happens after the handler returns, by which
-- point the acting user no longer exists -- INSERT ... REFERENCES users(id)
-- fails even though the actor was a perfectly valid, authenticated user at
-- the moment they acted. ON DELETE SET NULL only rewrites *existing* rows
-- when their referenced user is deleted; it does not let a *new* row
-- reference an id that is already gone.
--
-- An audit trail must survive the actor being deleted. This is the same
-- reasoning that already left entity_id un-keyed (docs/03-veri-modeli.md).

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_actor_id_fkey;
