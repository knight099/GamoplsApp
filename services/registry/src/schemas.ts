import { z } from "zod";

/**
 * Registration request body. Matches the contract expected by plugin
 * self-registration clients (e.g. plugins/asset-vehicle's boot-time HTTP
 * client): `POST /plugins/register` with `{ type, capabilities, endpoint }`.
 */
export const pluginRegistrationSchema = z.object({
  type: z.string().min(1),
  capabilities: z.array(z.string().min(1)).min(1),
  endpoint: z.string().min(1),
});

export type PluginRegistrationInput = z.infer<typeof pluginRegistrationSchema>;

/** A stored registration, as returned by the read API. */
export interface PluginRegistration extends PluginRegistrationInput {
  /** Server-assigned id for this registration. */
  id: string;
  /** When this registration was created/last (re-)registered, ISO 8601. */
  registeredAt: string;
}
