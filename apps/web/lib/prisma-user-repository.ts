import type { PrismaClient, UserRole } from "@gamopls/db";
import type { CreateUserInput, UserRecord, UserRepository } from "./user-repository.js";

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: {
    id: string;
    org_id: string;
    email: string;
    password_hash: string;
    name: string;
    role: string;
    last_fleet_id: string | null;
    created_at: Date;
  }): UserRecord {
    return {
      id: row.id,
      org_id: row.org_id,
      email: row.email,
      password_hash: row.password_hash,
      name: row.name,
      role: row.role,
      last_fleet_id: row.last_fleet_id,
      created_at: row.created_at.toISOString(),
    };
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const user = await this.prisma.user.create({
      data: { ...input, role: input.role as UserRole },
    });
    return this.map(user);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? this.map(user) : null;
  }

  async listByOrg(orgId: string): Promise<UserRecord[]> {
    const rows = await this.prisma.user.findMany({ where: { org_id: orgId }, orderBy: { created_at: "asc" } });
    return rows.map((r) => this.map(r));
  }

  async updateLastFleetId(userId: string, fleetId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { last_fleet_id: fleetId } });
  }
}
