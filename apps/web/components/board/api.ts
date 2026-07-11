import type { Mission, MissionStatus, Task, TaskStatus } from "./types";

/**
 * BOARD's gateway client. Per apps/web/lib/gateway-proxy.ts's contract,
 * every request goes through `fetch('/api/board/...')` — the Next.js route
 * handler at app/api/board/[...path]/route.ts validates the session and
 * attaches the tenant scope as a signed internal header before forwarding
 * to services/board. Create bodies are tenancy-free by design: the service
 * takes org/fleet from the gateway header only. This module NEVER fetches
 * services/board directly.
 */

export class BoardApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "BoardApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/board/${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `Board request failed: ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // response body wasn't JSON — fall back to the generic message.
    }
    throw new BoardApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function listMissions(): Promise<Mission[]> {
  const data = await request<{ missions: Mission[] }>("missions");
  return data.missions;
}

export async function createMission(input: {
  title: string;
  description: string;
  status?: MissionStatus;
}): Promise<Mission> {
  return request<Mission>("missions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listTasks(params?: { mission_id?: string }): Promise<Task[]> {
  const search = params?.mission_id ? `?mission_id=${encodeURIComponent(params.mission_id)}` : "";
  const data = await request<{ tasks: Task[] }>(`tasks${search}`);
  return data.tasks;
}

export async function createTask(input: {
  title: string;
  description: string;
  mission_id: string | null;
  asset_id: string | null;
  status?: TaskStatus;
}): Promise<Task> {
  return request<Task>("tasks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<Task> {
  return request<Task>(`tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function assignTask(taskId: string, assetId: string | null): Promise<Task> {
  return request<Task>(`tasks/${encodeURIComponent(taskId)}/assign`, {
    method: "POST",
    body: JSON.stringify({ asset_id: assetId }),
  });
}
