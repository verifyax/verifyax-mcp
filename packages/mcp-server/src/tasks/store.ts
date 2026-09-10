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
  /** Serializes refresh/cancel per task so concurrent polls cannot race. */
  private readonly taskLocks = new Map<string, Promise<void>>();

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

    await this.runExclusive(taskId, async () => {
      const existing = await this.inner.getTask(taskId, sessionId);
      if (!existing || isTerminal(existing.status)) {
        return;
      }

      const outcome = await this.refreshWork(taskId, taskWork, sessionId);
      await this.applyOutcomeIfActive(taskId, outcome, sessionId);
    });

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
    this.taskLocks.clear();
    this.inner.cleanup();
  }

  /**
   * Run `fn` exclusively for `taskId`. Concurrent callers for the same task
   * are queued; failures do not block subsequent waiters.
   */
  private runExclusive<T>(taskId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.taskLocks.get(taskId) ?? Promise.resolve();
    const run = previous.then(fn);
    this.taskLocks.set(
      taskId,
      run.then(
        () => undefined,
        () => undefined
      )
    );
    return run;
  }

  private async refreshWork(
    taskId: string,
    taskWork: VerifyaxTaskWork,
    sessionId?: string
  ): Promise<TaskRefreshOutcome> {
    const isTaskActive = async (): Promise<boolean> => {
      const task = await this.inner.getTask(taskId, sessionId);
      return task !== null && !isTerminal(task.status);
    };

    switch (taskWork.kind) {
      case 'generate_scenario':
        return refreshGenerateScenarioWork(taskWork);
      case 'evaluate_agent':
        return refreshEvaluateAgentWork(taskWork, isTaskActive);
      default:
        return assertNeverTaskKind(taskWork);
    }
  }

  private async applyOutcomeIfActive(
    taskId: string,
    outcome: TaskRefreshOutcome,
    sessionId?: string
  ): Promise<void> {
    const existing = await this.inner.getTask(taskId, sessionId);
    if (!existing || isTerminal(existing.status)) {
      return;
    }
    await this.applyOutcome(taskId, outcome, sessionId);
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
          if (taskWork.phase === 'eval' && taskWork.evalJobUuid !== undefined) {
            await taskWork.ctx.client.jobs.cancel(taskWork.evalJobUuid);
          } else {
            await taskWork.ctx.client.simulations.cancel(taskWork.simulationUuid);
          }
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
