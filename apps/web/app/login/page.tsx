"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Zap, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
    <div className="max-w-md mx-auto mt-20 px-4">
      <Card className="border border-border bg-card shadow-2xl backdrop-blur-sm">
        <CardHeader className="space-y-3 text-center pb-6">
          <div className="flex justify-center">
            <div className="p-3 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Zap className="h-8 w-8 fill-cyan-400/10 animate-pulse" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-white tracking-tight">
            Authorized Control Login
          </CardTitle>
          <CardDescription className="text-sm font-medium text-muted-foreground">
            GAMOPLS TeamCore Operations Portal
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Username
              </label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter dispatcher username"
                required
                className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-cyan-500/50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Password
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-cyan-500/50"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs font-medium text-rose-400">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button 
              type="submit" 
              className="w-full flex items-center justify-center h-10 px-4 rounded-lg bg-cyan-500 text-white font-semibold text-sm hover:bg-cyan-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              disabled={submitting}
            >
              {submitting ? "Authenticating Session..." : "Authorize Access"}
            </button>
          </form>

          <div className="border-t border-border pt-6 text-center">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
              Demo Credentials: demo / demo
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
