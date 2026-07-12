"use client";

import { useEffect, useState } from "react";
import { Card, Spinner } from "@gamopls/ui";
import { Copy, RefreshCw } from "lucide-react";
import * as orgApi from "./api";
import type { OrgInfo } from "./api";

export default function OrgPage() {
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    orgApi
      .getOrgInfo()
      .then(setOrg)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load org"))
      .finally(() => setLoading(false));
  }, []);

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const link = await orgApi.regenerateInviteLink();
      setOrg((current) => (current ? { ...current, invite_link: link } : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate invite link");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleCopy() {
    if (!org) return;
    await navigator.clipboard.writeText(org.invite_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={32} label="Loading team" />
      </div>
    );
  }

  if (error || !org) {
    return (
      <Card className="border border-border bg-card p-6 text-center max-w-lg mx-auto mt-12">
        <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg">
          {error ?? "Failed to load org"}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{org.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">Team & invites</p>
      </div>

      <Card className="border border-border bg-card p-6 space-y-3">
        <h2 className="text-lg font-bold text-foreground">Invite link</h2>
        <p className="text-sm text-muted-foreground">
          Share this link with a teammate — anyone who signs up with it joins your team.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-background/50 border border-border rounded-md px-3 py-2 truncate">
            {org.invite_link}
          </code>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs font-semibold text-foreground hover:bg-accent"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            disabled={regenerating}
            onClick={() => void handleRegenerate()}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Regenerating invalidates the link above — anyone who hasn&apos;t used it yet will need the new one.
        </p>
      </Card>

      <Card className="border border-border bg-card p-6">
        <h2 className="text-lg font-bold text-foreground mb-4 border-b border-border/50 pb-2">Team</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="py-2">Name</th>
              <th className="py-2">Email</th>
              <th className="py-2">Role</th>
              <th className="py-2">Joined</th>
            </tr>
          </thead>
          <tbody>
            {org.members.map((m) => (
              <tr key={m.id} className="border-b border-border/50">
                <td className="py-2 font-semibold text-foreground">{m.name}</td>
                <td className="py-2 text-muted-foreground">{m.email}</td>
                <td className="py-2 text-muted-foreground capitalize">{m.role.replace("_", " ")}</td>
                <td className="py-2 text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
