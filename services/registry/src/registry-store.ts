import type { PluginRegistration, PluginRegistrationInput } from "./schemas.js";

/**
 * In-memory plugin registry store (V1). A `type`+`endpoint` pair is
 * re-registerable (idempotent upsert) so a plugin can safely retry/renew
 * its registration on reconnect without accumulating duplicate entries.
 *
 * Deliberately not backed by Postgres for V1 — see the registry service
 * report for rationale (re-registration on every plugin boot makes an
 * in-memory Map sufficient, and it keeps this service dependency-free).
 */
export class RegistryStore {
  private readonly registrations = new Map<string, PluginRegistration>();

  private keyFor(type: string, endpoint: string): string {
    return `${type}::${endpoint}`;
  }

  register(input: PluginRegistrationInput): PluginRegistration {
    const key = this.keyFor(input.type, input.endpoint);
    const existing = this.registrations.get(key);
    const record: PluginRegistration = {
      ...input,
      id: existing?.id ?? key,
      registeredAt: new Date().toISOString(),
    };
    this.registrations.set(key, record);
    return record;
  }

  list(): PluginRegistration[] {
    return Array.from(this.registrations.values());
  }

  clear(): void {
    this.registrations.clear();
  }
}
