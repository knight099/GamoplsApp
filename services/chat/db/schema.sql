-- CHAT module service schema — V1, plain SQL, no migration framework.
-- Apply manually: psql "$DATABASE_URL" -f db/schema.sql
-- (per PLAN.md 4.2: keep persistence simple, no heavyweight ORM/migration tool for a V1 service)

CREATE TABLE IF NOT EXISTS mission_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  fleet_id TEXT NOT NULL,
  -- Opaque reference to a Mission owned by services/board. Chat never joins
  -- against a missions table — it doesn't have one.
  mission_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mission_channels_org_mission ON mission_channels (org_id, mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_channels_org_fleet ON mission_channels (org_id, fleet_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES mission_channels (id) ON DELETE CASCADE,
  org_id TEXT NOT NULL,
  fleet_id TEXT NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'system')),
  sender_id TEXT NOT NULL,
  body TEXT NOT NULL,
  asset_id TEXT,
  -- Media reference only: pointer + metadata, never a blob (CLAUDE.md rule).
  media_url TEXT,
  media_filename TEXT,
  media_mime_type TEXT,
  media_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages (channel_id, created_at);
