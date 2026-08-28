import type {
  ActionExecutionRequest,
  ActionExecutionResult,
  ActionExecutor,
} from '../interfaces/action-execution.interface.js';
export class ActionExecutorRegistry {
  private readonly executors = new Map<string, ActionExecutor>();

  register(actionId: string, executor: ActionExecutor): void {
    if (this.executors.has(actionId)) {
      throw new Error(`Duplicate Genfeed action executor: ${actionId}`);
    }

    this.executors.set(actionId, executor);
  }

  has(actionId: string): boolean {
    return this.executors.has(actionId);
  }

  listRegisteredActionIds(): string[] {
    return [...this.executors.keys()].sort((left, right) =>
      left.localeCompare(right),
    );
  }

  assertCoverage(actionIds: readonly string[]): void {
    const missing = actionIds.filter((actionId) => !this.has(actionId));
    if (missing.length > 0) {
      throw new Error(
        `Missing Genfeed action executors: ${missing.join(', ')}`,
      );
    }
  }

  async execute(
    request: ActionExecutionRequest,
  ): Promise<ActionExecutionResult> {
    const executor = this.executors.get(request.context.actionId);
    if (!executor) {
      throw new Error(
        `No Genfeed action executor registered for ${request.context.actionId}`,
      );
    }

    return executor(request);
  }
}
