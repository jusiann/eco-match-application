-- Schema improvements (input tracking columns, chatbot session separation, index)

-- 1. Input embedding tracking columns
ALTER TABLE inputs
  ADD COLUMN IF NOT EXISTS pending_review    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS embedding_pending BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Message session separation
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS session_id UUID NOT NULL DEFAULT gen_random_uuid();

-- 3. Composite index for efficient session listing
CREATE INDEX IF NOT EXISTS idx_messages_user_session ON messages(user_id, session_id);

