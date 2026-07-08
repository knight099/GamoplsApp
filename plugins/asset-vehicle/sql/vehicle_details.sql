-- VehicleDetails table — owned entirely by plugins/asset-vehicle.
--
-- CRITICAL ARCHITECTURE RULE (CLAUDE.md): this table lives in storage owned
-- by this plugin. It is referenced by asset_id only and must NEVER be joined
-- into or duplicated in services/board's Mission/Task tables. Those tables
-- are asset-type-agnostic; trip-specific data stays here.
--
-- Lightweight plain SQL DDL on purpose — no ORM/migration tooling stood up
-- for a single plugin package in isolation. A real service embedding this
-- plugin can adapt this DDL to whatever migration tool it already uses.

CREATE TABLE IF NOT EXISTS vehicle_details (
  asset_id              UUID PRIMARY KEY, -- FK to Asset.id, resolved via the registry/event bus, never a cross-service SQL join
  plate_number          TEXT NOT NULL,
  vehicle_type          TEXT NOT NULL CHECK (vehicle_type IN ('truck', 'van', 'car', 'bike', 'bus', 'other')),
  make                  TEXT,
  model                 TEXT,
  fuel_type             TEXT NOT NULL CHECK (fuel_type IN ('petrol', 'diesel', 'electric', 'hybrid', 'cng')),
  fuel_capacity_liters  NUMERIC,
  odometer_km           NUMERIC NOT NULL DEFAULT 0,

  -- current trip leg, flattened (single-row snapshot for V1; no trip history table yet)
  trip_started_at       TIMESTAMPTZ,
  trip_ended_at         TIMESTAMPTZ,
  trip_origin_label     TEXT,
  trip_destination_label TEXT,
  trip_distance_km      NUMERIC,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_details_plate_number ON vehicle_details (plate_number);
