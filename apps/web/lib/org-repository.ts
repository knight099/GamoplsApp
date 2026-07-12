export interface OrgRecord {
  id: string;
  name: string;
  invite_token: string;
}

export interface OrgRepository {
  create(name: string): Promise<OrgRecord>;
  findById(id: string): Promise<OrgRecord | null>;
  findByInviteToken(token: string): Promise<OrgRecord | null>;
  regenerateInviteToken(orgId: string): Promise<string>;
  /** Compensating action if a signup fails after the Org is created but
   * before its Fleet/User exist — see app/api/signup/route.ts. */
  delete(orgId: string): Promise<void>;
}

function randomToken(seed: string): string {
  return `invite-${seed}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export class InMemoryOrgRepository implements OrgRepository {
  private readonly orgs = new Map<string, OrgRecord>();
  private counter = 0;

  async create(name: string): Promise<OrgRecord> {
    const id = `org-${++this.counter}`;
    const org: OrgRecord = { id, name, invite_token: randomToken(id) };
    this.orgs.set(id, org);
    return org;
  }

  async findById(id: string): Promise<OrgRecord | null> {
    return this.orgs.get(id) ?? null;
  }

  async findByInviteToken(token: string): Promise<OrgRecord | null> {
    return [...this.orgs.values()].find((o) => o.invite_token === token) ?? null;
  }

  async regenerateInviteToken(orgId: string): Promise<string> {
    const org = this.orgs.get(orgId);
    if (!org) throw new Error(`org ${orgId} not found`);
    org.invite_token = randomToken(orgId);
    return org.invite_token;
  }

  async delete(orgId: string): Promise<void> {
    this.orgs.delete(orgId);
  }
}
