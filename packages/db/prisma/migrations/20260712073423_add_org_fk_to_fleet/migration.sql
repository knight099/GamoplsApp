/*
  Warnings:

  - Changed the type of `org_id` on the `fleets` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "fleets" DROP COLUMN "org_id",
ADD COLUMN     "org_id" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "fleets_org_id_idx" ON "fleets"("org_id");

-- AddForeignKey
ALTER TABLE "fleets" ADD CONSTRAINT "fleets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
