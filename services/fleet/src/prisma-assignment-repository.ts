import type { PrismaClient } from "@gamopls/db";
import type { AssignmentRepository } from "./assignment-repository.js";
import type { DriverAssignment } from "./types.js";

export class PrismaAssignmentRepository implements AssignmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(db: any): DriverAssignment {
    return {
      id: db.id,
      org_id: db.org_id,
      fleet_id: db.fleet_id,
      asset_id: db.asset_id,
      driver_id: db.driver_id,
      assigned_at: db.assigned_at.toISOString(),
      unassigned_at: db.unassigned_at ? db.unassigned_at.toISOString() : null,
    };
  }

  async assign(org_id: string, fleet_id: string, asset_id: string, driver_id: string): Promise<DriverAssignment> {
    return this.prisma.$transaction(async (tx: any) => {
      await tx.driverAssignment.updateMany({
        where: { asset_id, unassigned_at: null },
        data: { unassigned_at: new Date() },
      });
      const created = await tx.driverAssignment.create({
        data: { org_id, fleet_id, asset_id, driver_id },
      });
      return this.map(created);
    });
  }

  async unassignCurrent(org_id: string, fleet_id: string, asset_id: string): Promise<DriverAssignment | null> {
    const open = await this.prisma.driverAssignment.findFirst({
      where: { org_id, fleet_id, asset_id, unassigned_at: null },
    });
    if (!open) return null;
    const updated = await this.prisma.driverAssignment.update({
      where: { id: open.id },
      data: { unassigned_at: new Date() },
    });
    return this.map(updated);
  }

  async history(org_id: string, fleet_id: string, asset_id: string): Promise<DriverAssignment[]> {
    const rows = await this.prisma.driverAssignment.findMany({
      where: { org_id, fleet_id, asset_id },
      orderBy: { assigned_at: "desc" },
    });
    return rows.map((r: any) => this.map(r));
  }
}
