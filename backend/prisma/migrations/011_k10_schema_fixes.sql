-- K-10 schema fixes. See docs/09-kararlar.md K-10.
--
-- 1) inputs: add pending_review and embedding_pending columns (parity with outputs).
-- 2) messages: add session_id for chatbot session separation.
-- 3) messages: composite index on (user_id, session_id) for efficient session queries.
--
-- WeightsConfig partial unique index already exists in 007_config.sql line 31.
-- HumanReviewQueue.output_id FK already exists in 005_matching.sql line 30.
-- Both are Prisma-side-only fixes (adding the relation/index annotation).

-- 1. Input embedding tracking columns
ALTER TABLE inputs
  ADD COLUMN IF NOT EXISTS pending_review    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS embedding_pending BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Message session separation
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS session_id UUID NOT NULL DEFAULT gen_random_uuid();

-- 3. Composite index for efficient session listing
CREATE INDEX IF NOT EXISTS idx_messages_user_session ON messages(user_id, session_id);

