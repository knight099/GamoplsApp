import { BoardView } from "@/components/board/BoardView";

/**
 * BOARD view — PLAN.md 6.6. Missions/Tasks are fetched and mutated
 * exclusively via fetch('/api/board/...') (see apps/web/components/board/api.ts
 * and apps/web/lib/gateway-proxy.ts) — this route never talks to
 * services/board directly.
 */
export default function BoardPage() {
  return <BoardView />;
}
