export interface OrgTeamMember {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

export interface OrgInfo {
  id: string;
  name: string;
  invite_link: string;
  members: OrgTeamMember[];
}

export class OrgApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OrgApiError";
  }
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    throw new OrgApiError(typeof body.error === "string" ? body.error : res.statusText, res.status);
  }
  return (await res.json()) as T;
}

export async function getOrgInfo(): Promise<OrgInfo> {
  const res = await fetch("/api/org");
  return parseOrThrow<OrgInfo>(res);
}

export async function regenerateInviteLink(): Promise<string> {
  const res = await fetch("/api/org/invite", { method: "POST" });
  const body = await parseOrThrow<{ invite_link: string }>(res);
  return body.invite_link;
}
