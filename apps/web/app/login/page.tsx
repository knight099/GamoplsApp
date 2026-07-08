"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

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
    <div style={{ maxWidth: 420, margin: "4rem auto 0 auto" }}>
      <div className="saas-card animate-fade-in" style={{ padding: "2.5rem" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <span style={{ fontSize: "3rem" }}>⚡</span>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "1rem" }}>Authorized Login</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
            GAMOPLS TeamCore Operations Control
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem", fontWeight: 500 }}>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. demo"
              required
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem", fontWeight: 500 }}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="e.g. demo"
              required
            />
          </label>

          {error && (
            <p style={{ color: "var(--accent-rose)", fontSize: "0.875rem", background: "rgba(244, 63, 94, 0.1)", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid rgba(244, 63, 94, 0.2)" }}>
              ⚠️ {error}
            </p>
          )}

          <button type="submit" className="btn-premium btn-premium-primary" style={{ width: "100%", marginTop: "0.5rem" }} disabled={submitting}>
            {submitting ? "Authenticating Session..." : "Authorize Access"}
          </button>
        </form>

        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center", marginTop: "2rem" }}>
          Note: This is a demo gateway gate. Valid credentials are configured in your env (defaults: demo / demo).
        </p>
      </div>
    </div>
  );
}
