"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@gamopls/ui";

/**
 * V1 placeholder login page — posts to /api/login, which checks a
 * hardcoded/env-configured demo credential (see lib/demo-login.ts) and sets
 * an httpOnly session cookie. Not a real identity/user-management UI.
 */
export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Login failed");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "0 auto" }}>
      <Card>
        <h1 style={{ fontSize: "1.25rem" }}>Log in</h1>
        <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>
          V1 demo login (placeholder — see <code>DEMO_LOGIN_USERNAME</code>/
          <code>DEMO_LOGIN_PASSWORD</code> in <code>.env.example</code>).
        </p>
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.875rem" }}>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.375rem" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.875rem" }}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.375rem" }}
            />
          </label>
          {error && <p style={{ color: "#dc2626", fontSize: "0.875rem" }}>{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
