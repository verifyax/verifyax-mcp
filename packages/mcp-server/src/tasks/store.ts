import {
  InMemoryTaskStore,
  type CreateTaskOptions,
  type TaskStore,
  isTerminal,
} from '@modelcontextprotocol/sdk/experimental/tasks/index.js';
import type { Request, RequestId, Result, Task } from '@modelcontextprotocol/sdk/types.js';
import { refreshEvaluateAgentWork } from './resolve-evaluate.js';
import { refreshGenerateScenarioWork } from './resolve-generate.js';
import type { TaskRefreshOutcome, VerifyaxTaskWork } from './types.js';

/**
 * Task store that keeps VerifyAX job metadata alongside the SDK in-memory task
 * records. `getTask` refreshes live status from VerifyAX before returning so
 * both MCP task polling and the SDK's automatic blocking poll see up-to-date
 * progress without holding `tools/call` open.
 */
export class VerifyaxTaskStore implements TaskStore {
  private readonly inner = new InMemoryTaskStore();
  private readonly work = new Map<string, VerifyaxTaskWork>();

  /** Attach VerifyAX work to a task created via {@link createTask}. */
  setWork(taskId: string, taskWork: VerifyaxTaskWork): void {
    this.work.set(taskId, taskWork);
  }

  getWork(taskId: string): VerifyaxTaskWork | undefined {
    return this.work.get(taskId);
  }

  async createTask(
    taskParams: CreateTaskOptions,
    requestId: RequestId,
    request: Request,
    sessionId?: string
  ): Promise<Task> {
    return this.inner.createTask(taskParams, requestId, request, sessionId);
  }

  async getTask(taskId: string, sessionId?: string): Promise<Task | null> {
    const taskWork = this.work.get(taskId);
    if (!taskWork) {
      return this.inner.getTask(taskId, sessionId);
    }

    const existing = await this.inner.getTask(taskId, sessionId);
    if (!existing || isTerminal(existing.status)) {
      return existing;
    }

    const outcome = await this.refreshWork(taskWork);
    await this.applyOutcome(taskId, outcome, sessionId);
    return this.inner.getTask(taskId, sessionId);
  }

  async storeTaskResult(
    taskId: string,
    status: 'completed' | 'failed',
    result: Result,
    sessionId?: string
  ): Promise<void> {
    await this.inner.storeTaskResult(taskId, status, result, sessionId);
  }

  async getTaskResult(taskId: string, sessionId?: string): Promise<Result> {
    return this.inner.getTaskResult(taskId, sessionId);
  }

  async updateTaskStatus(
    taskId: string,
    status: Task['status'],
    statusMessage?: string,
    sessionId?: string
  ): Promise<void> {
    if (status === 'cancelled') {
      await this.cancelVerifyaxWork(taskId);
    }
    await this.inner.updateTaskStatus(taskId, status, statusMessage, sessionId);
  }

  async listTasks(
    cursor?: string,
    sessionId?: string
  ): Promise<{ tasks: Task[]; nextCursor?: string }> {
    return this.inner.listTasks(cursor, sessionId);
  }

  cleanup(): void {
    this.work.clear();
    this.inner.cleanup();
  }

  private async refreshWork(taskWork: VerifyaxTaskWork): Promise<TaskRefreshOutcome> {
    switch (taskWork.kind) {
      case 'generate_scenario':
        return refreshGenerateScenarioWork(taskWork);
      case 'evaluate_agent':
        return refreshEvaluateAgentWork(taskWork);
      default:
        return assertNeverTaskKind(taskWork);
    }
  }

  private async applyOutcome(
    taskId: string,
    outcome: TaskRefreshOutcome,
    sessionId?: string
  ): Promise<void> {
    if (outcome.status === 'working') {
      await this.inner.updateTaskStatus(taskId, 'working', outcome.statusMessage, sessionId);
      return;
    }

    if (outcome.status === 'cancelled') {
      await this.inner.updateTaskStatus(
        taskId,
        'cancelled',
        outcome.statusMessage ?? 'Task cancelled',
        sessionId
      );
      return;
    }

    if (outcome.result !== undefined) {
      const storeStatus = outcome.status === 'failed' ? 'failed' : 'completed';
      await this.inner.storeTaskResult(taskId, storeStatus, outcome.result, sessionId);
      return;
    }

    await this.inner.updateTaskStatus(taskId, outcome.status, outcome.statusMessage, sessionId);
  }

  private async cancelVerifyaxWork(taskId: string): Promise<void> {
    const taskWork = this.work.get(taskId);
    if (!taskWork) {
      return;
    }

    try {
      switch (taskWork.kind) {
        case 'generate_scenario':
          await taskWork.ctx.client.jobs.cancel(taskWork.jobUuid);
          break;
        case 'evaluate_agent':
          await taskWork.ctx.client.simulations.cancel(taskWork.simulationUuid);
          break;
        default:
          assertNeverTaskKind(taskWork);
      }
    } catch (error) {
      taskWork.ctx.logger.warn('VerifyAX cancel failed (cooperative cancellation)', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function assertNeverTaskKind(work: never): TaskRefreshOutcome {
  const kind = (work as VerifyaxTaskWork).kind;
  return {
    status: 'failed',
    statusMessage: `Unknown task kind: ${kind}`,
  };
}
