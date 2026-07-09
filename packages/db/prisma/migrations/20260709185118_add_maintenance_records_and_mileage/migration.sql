-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "last_mileage_kmpl" DECIMAL;

-- CreateTable
CREATE TABLE "maintenance_suggestions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "fleet_id" TEXT NOT NULL,
    "asset_id" UUID NOT NULL,
    "service_type" TEXT NOT NULL,
    "suggested_at_odometer_km" DECIMAL NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL,
    "service_type" TEXT NOT NULL,
    "performed_at" TIMESTAMPTZ NOT NULL,
    "odometer_at_service_km" DECIMAL NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_suggestions_org_id_fleet_id_idx" ON "maintenance_suggestions"("org_id", "fleet_id");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_suggestions_asset_id_service_type_key" ON "maintenance_suggestions"("asset_id", "service_type");

-- CreateIndex
CREATE INDEX "maintenance_records_asset_id_service_type_idx" ON "maintenance_records"("asset_id", "service_type");
