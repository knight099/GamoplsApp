import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@gamopls/db";
import type { OrgRecord, OrgRepository } from "./org-repository.js";

export class PrismaOrgRepository implements OrgRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: { id: string; name: string; invite_token: string }): OrgRecord {
    return { id: row.id, name: row.name, invite_token: row.invite_token };
  }

  async create(name: string): Promise<OrgRecord> {
    const org = await this.prisma.org.create({ data: { name } });
    return this.map(org);
  }

  async findById(id: string): Promise<OrgRecord | null> {
    const org = await this.prisma.org.findUnique({ where: { id } });
    return org ? this.map(org) : null;
  }

  async findByInviteToken(token: string): Promise<OrgRecord | null> {
    const org = await this.prisma.org.findUnique({ where: { invite_token: token } });
    return org ? this.map(org) : null;
  }

  async regenerateInviteToken(orgId: string): Promise<string> {
    const updated = await this.prisma.org.update({
      where: { id: orgId },
      data: { invite_token: randomUUID() },
    });
    return updated.invite_token;
  }

  async delete(orgId: string): Promise<void> {
    await this.prisma.org.delete({ where: { id: orgId } });
  }
}
