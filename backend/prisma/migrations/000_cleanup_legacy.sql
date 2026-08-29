-- One-time cleanup of pre-existing dev debris from an earlier `prisma migrate dev`
-- run (migration 20260528133247_init). Not part of the numbered schema history —
-- 001 onward is the real, hand-written source of truth (see docs/09-kararlar.md K-04, K-11).
--
-- Confirmed empty of anything worth keeping before running: 2 osbs, 3 facilities,
-- 3 users, all test data from manual auth endpoint testing.

DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS facilities CASCADE;
DROP TABLE IF EXISTS osbs CASCADE;
DROP TABLE IF EXISTS _prisma_migrations CASCADE;

DROP TYPE IF EXISTS "UserRole";
DROP TYPE IF EXISTS "MatchStatus";
DROP TYPE IF EXISTS "RecordType";
