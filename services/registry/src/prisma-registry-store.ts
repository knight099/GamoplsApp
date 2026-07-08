import type { PrismaClient } from "@gamopls/db";
import type { PluginRegistration, PluginRegistrationInput } from "./schemas.js";

type DbPluginRegistration = {
  id: string;
  type: string;
  endpoint: string;
  capabilities: string[];
  registered_at: Date;
};

export interface IRegistryStore {
  register(input: PluginRegistrationInput): Promise<PluginRegistration> | PluginRegistration;
  list(): Promise<PluginRegistration[]> | PluginRegistration[];
  clear(): Promise<void> | void;
}

export class PrismaRegistryStore implements IRegistryStore {
  constructor(private readonly prisma: PrismaClient) {}

  async register(input: PluginRegistrationInput): Promise<PluginRegistration> {
    const dbRecord = await this.prisma.pluginRegistration.upsert({
      where: {
        type_endpoint: {
          type: input.type,
          endpoint: input.endpoint,
        },
      },
      update: {
        capabilities: input.capabilities,
        registered_at: new Date(),
      },
      create: {
        type: input.type,
        endpoint: input.endpoint,
        capabilities: input.capabilities,
      },
    });

    return {
      id: dbRecord.id,
      type: dbRecord.type,
      capabilities: dbRecord.capabilities,
      endpoint: dbRecord.endpoint,
      registeredAt: dbRecord.registered_at.toISOString(),
    };
  }

  async list(): Promise<PluginRegistration[]> {
    const dbRecords = await this.prisma.pluginRegistration.findMany({
      orderBy: { registered_at: "desc" },
    });

    return dbRecords.map((r: DbPluginRegistration) => ({
      id: r.id,
      type: r.type,
      capabilities: r.capabilities,
      endpoint: r.endpoint,
      registeredAt: r.registered_at.toISOString(),
    }));
  }

  async clear(): Promise<void> {
    await this.prisma.pluginRegistration.deleteMany();
  }
}
