import { createGatewayHandler } from "@/lib/gateway-proxy";

// Gateway to services/chat — see lib/gateway-proxy.ts for the auth +
// org/fleet scoping contract every service gateway follows.
const handler = createGatewayHandler("CHAT_SERVICE_URL");

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
};
