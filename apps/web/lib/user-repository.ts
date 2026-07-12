export interface UserRecord {
  id: string;
  org_id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  last_fleet_id: string | null;
  created_at: string;
}

export interface CreateUserInput {
  org_id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  last_fleet_id: string;
}

export interface UserRepository {
  create(input: CreateUserInput): Promise<UserRecord>;
  findByEmail(email: string): Promise<UserRecord | null>;
  listByOrg(orgId: string): Promise<UserRecord[]>;
  updateLastFleetId(userId: string, fleetId: string): Promise<void>;
}

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, UserRecord>();
  private counter = 0;

  async create(input: CreateUserInput): Promise<UserRecord> {
    const id = `user-${++this.counter}`;
    const user: UserRecord = { id, created_at: new Date().toISOString(), ...input };
    this.users.set(id, user);
    return user;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }

  async listByOrg(orgId: string): Promise<UserRecord[]> {
    return [...this.users.values()].filter((u) => u.org_id === orgId);
  }

  async updateLastFleetId(userId: string, fleetId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) user.last_fleet_id = fleetId;
  }

  /** Test helper: insert a fully-formed record directly, bypassing
   * create()'s required last_fleet_id — used to set up edge cases like a
   * pre-existing user with no last_fleet_id yet. */
  seed(user: UserRecord): void {
    this.users.set(user.id, user);
  }
}
