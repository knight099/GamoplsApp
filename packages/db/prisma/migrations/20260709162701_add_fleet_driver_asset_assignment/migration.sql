-- AlterTable
ALTER TABLE "vehicle_details" ADD COLUMN     "color" TEXT,
ADD COLUMN     "vin" TEXT,
ADD COLUMN     "year" TEXT;

-- CreateTable
CREATE TABLE "fleets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fleets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "fleet_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "license_number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "org_id" TEXT NOT NULL,
    "fleet_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "display_label" TEXT NOT NULL,
    "health_score" INTEGER NOT NULL DEFAULT 100,
    "telemetry" JSONB NOT NULL DEFAULT '{}',
    "telemetry_updated_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "fleet_id" TEXT NOT NULL,
    "asset_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMPTZ,

    CONSTRAINT "driver_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fleets_org_id_idx" ON "fleets"("org_id");

-- CreateIndex
CREATE INDEX "drivers_org_id_fleet_id_idx" ON "drivers"("org_id", "fleet_id");

-- CreateIndex
CREATE INDEX "assets_org_id_fleet_id_idx" ON "assets"("org_id", "fleet_id");

-- CreateIndex
CREATE INDEX "driver_assignments_asset_id_unassigned_at_idx" ON "driver_assignments"("asset_id", "unassigned_at");

-- CreateIndex
CREATE INDEX "driver_assignments_org_id_fleet_id_idx" ON "driver_assignments"("org_id", "fleet_id");

-- AddForeignKey
ALTER TABLE "driver_assignments" ADD CONSTRAINT "driver_assignments_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_assignments" ADD CONSTRAINT "driver_assignments_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
