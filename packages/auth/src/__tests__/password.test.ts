import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../password.js";

describe("hashPassword / verifyPassword", () => {
  it("round-trips a password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    const [a, b] = await Promise.all([hashPassword("same-password"), hashPassword("same-password")]);
    expect(a).not.toBe(b);
    expect(await verifyPassword("same-password", a)).toBe(true);
    expect(await verifyPassword("same-password", b)).toBe(true);
  });

  it("never stores the plaintext inside the hash", async () => {
    const hash = await hashPassword("super-secret-plaintext");
    expect(hash).not.toContain("super-secret-plaintext");
  });
});
