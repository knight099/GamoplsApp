-- services/board schema — asset-type-agnostic by design (CLAUDE.md rule).
-- No vehicle-specific columns here, ever. Assets are referenced only via
-- opaque asset_id text columns. No migrations framework for V1: this file
-- is applied directly (idempotent via IF NOT EXISTS) — deliberately no
-- heavy ORM/migration tool, per Phase 4.3 scope.

CREATE TABLE IF NOT EXISTS missions (
  id UUID PRIMARY KEY,
  org_id TEXT NOT NULL,
  fleet_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_missions_org_fleet ON missions (org_id, fleet_id);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY,
  org_id TEXT NOT NULL,
  fleet_id TEXT NOT NULL,
  mission_id UUID NULL REFERENCES missions (id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'in_progress', 'done', 'cancelled')),
  -- Opaque reference to any Taskable asset (vehicle, drone, vessel, ...).
  -- Never a foreign key into a plugin's own tables.
  asset_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_org_fleet ON tasks (org_id, fleet_id);
CREATE INDEX IF NOT EXISTS idx_tasks_mission_id ON tasks (mission_id);
CREATE INDEX IF NOT EXISTS idx_tasks_asset_id ON tasks (asset_id);
