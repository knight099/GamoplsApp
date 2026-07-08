-- CreateTable
CREATE TABLE "missions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "fleet_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "fleet_id" TEXT NOT NULL,
    "mission_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "asset_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mission_channels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "fleet_id" TEXT NOT NULL,
    "mission_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mission_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel_id" UUID NOT NULL,
    "org_id" TEXT NOT NULL,
    "fleet_id" TEXT NOT NULL,
    "sender_type" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "asset_id" TEXT,
    "media_url" TEXT,
    "media_filename" TEXT,
    "media_mime_type" TEXT,
    "media_size" BIGINT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "fleet_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "uploader" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "storage_location" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_registrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "registered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plugin_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_details" (
    "asset_id" UUID NOT NULL,
    "plate_number" TEXT NOT NULL,
    "vehicle_type" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "fuel_type" TEXT NOT NULL,
    "fuel_capacity_liters" DECIMAL,
    "odometer_km" DECIMAL NOT NULL DEFAULT 0,
    "trip_started_at" TIMESTAMPTZ,
    "trip_ended_at" TIMESTAMPTZ,
    "trip_origin_label" TEXT,
    "trip_destination_label" TEXT,
    "trip_distance_km" DECIMAL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_details_pkey" PRIMARY KEY ("asset_id")
);

-- CreateIndex
CREATE INDEX "missions_org_id_fleet_id_idx" ON "missions"("org_id", "fleet_id");

-- CreateIndex
CREATE INDEX "tasks_org_id_fleet_id_idx" ON "tasks"("org_id", "fleet_id");

-- CreateIndex
CREATE INDEX "tasks_mission_id_idx" ON "tasks"("mission_id");

-- CreateIndex
CREATE INDEX "tasks_asset_id_idx" ON "tasks"("asset_id");

-- CreateIndex
CREATE INDEX "mission_channels_org_id_mission_id_idx" ON "mission_channels"("org_id", "mission_id");

-- CreateIndex
CREATE INDEX "mission_channels_org_id_fleet_id_idx" ON "mission_channels"("org_id", "fleet_id");

-- CreateIndex
CREATE INDEX "chat_messages_channel_id_created_at_idx" ON "chat_messages"("channel_id", "created_at");

-- CreateIndex
CREATE INDEX "documents_org_id_fleet_id_idx" ON "documents"("org_id", "fleet_id");

-- CreateIndex
CREATE UNIQUE INDEX "plugin_registrations_type_endpoint_key" ON "plugin_registrations"("type", "endpoint");

-- CreateIndex
CREATE INDEX "vehicle_details_plate_number_idx" ON "vehicle_details"("plate_number");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "mission_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
