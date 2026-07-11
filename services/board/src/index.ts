export { buildApp } from "./build-app.js";
export type { BuildAppOptions } from "./build-app.js";

export { InMemoryBoardRepository } from "./in-memory-repository.js";
export { PostgresBoardRepository } from "./postgres-repository.js";
export type { BoardRepository } from "./repository.js";

export {
  assignTaskToAsset,
  unassignTask,
  TaskNotFoundError,
  type AssignableAsset,
} from "./task-assignment.js";

export { subscribeTaskSuggested } from "./task-suggested-handler.js";

export {
  registerAgentPlugin,
  AgentRegistrationError,
  type AgentPluginMetadata,
  type RegisterAgentPluginOptions,
} from "./agent-registration-client.js";

export {
  missionSchema,
  taskSchema,
  missionStatusSchema,
  taskStatusSchema,
  createMissionBodySchema,
  createTaskBodySchema,
  updateMissionInputSchema,
  updateTaskInputSchema,
  assignTaskInputSchema,
  ALLOWED_MISSION_FIELDS,
  ALLOWED_TASK_FIELDS,
  FORBIDDEN_ASSET_SPECIFIC_FIELDS,
  type Mission,
  type Task,
  type MissionStatus,
  type TaskStatus,
  type CreateMissionInput,
  type CreateTaskInput,
  type UpdateMissionInput,
  type UpdateTaskInput,
  type AssignTaskInput,
} from "./types.js";
