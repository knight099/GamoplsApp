import { describe, expect, it } from "vitest";
import { NatsEventBus } from "../index.js";

describe("NatsEventBus", () => {
  it("throws when publishing before connect()", async () => {
    const bus = new NatsEventBus({ servers: "nats://localhost:4222" });
    await expect(bus.publish("test.subject", { hello: "world" })).rejects.toThrow(
      /not connected/i,
    );
  });

  it("throws when subscribing before connect()", async () => {
    const bus = new NatsEventBus({ servers: "nats://localhost:4222" });
    await expect(bus.subscribe("test.subject", () => {})).rejects.toThrow(/not connected/i);
  });
});
