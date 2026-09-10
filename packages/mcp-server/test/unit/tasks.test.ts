import type { Request } from '@modelcontextprotocol/sdk/types.js';
import { VerifyaxClient } from '@verifyax/sdk';
import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../src/logging.js';
import { VerifyaxTaskStore } from '../../src/tasks/store.js';
import { startEvaluateAgent } from '../../src/tools/evaluate-agent.js';
import { startGenerateScenario } from '../../src/tools/generate-scenario.js';
import type { ToolContext } from '../../src/tools/context.js';
import { payloadOf } from './helpers.js';

function sequentialStubContext(
  handlers: Array<(url: string, method: string) => { status?: number; body?: unknown } | null>
): ToolContext {
  let callIndex = 0;
  const client = new VerifyaxClient({
    apiKey: 'test',
    baseUrl: 'https://api.test/api/v1',
    webBaseUrl: 'https://api.test/web/api/v1',
    maxRetries: 0,
    fetch: async (url, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const handler = handlers[callIndex];
      callIndex += 1;
      const response = handler?.(url, method);
      if (!response) {
        return new Response(JSON.stringify({ message: `no stub for call ${callIndex}` }), {
          status: 599,
          headers: { 'content-type': 'application/json' },
        });
      }
      const status = response.status ?? 200;
      const hasBody = response.body !== undefined;
      return new Response(hasBody ? JSON.stringify(response.body) : null, {
        status,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  return { client, logger: createLogger({ level: 'silent' }) };
}

async function createGenerateTask(store: VerifyaxTaskStore, ctx: ToolContext) {
  const started = await startGenerateScenario(ctx, {
    name: 'demo',
    scenario_type: 'interview',
  });
  const task = await store.createTask({ ttl: 3_600_000, pollInterval: 100 }, 1, {
    method: 'tools/call',
    params: { name: 'generate_scenario' },
  } as Request);
  store.setWork(task.taskId, {
    kind: 'generate_scenario',
    ctx,
    scenarioUuid: started.scenarioUuid,
    jobUuid: started.jobUuid,
    scenarioType: 'interview',
    isBatch: false,
  });
  return { taskId: task.taskId };
}

describe('MCP tasks', () => {
  it('refreshes generate_scenario from working to completed via getTask', async () => {
    const store = new VerifyaxTaskStore();
    const ctx = sequentialStubContext([
      () => ({
        body: { uuid: 's1', job_uuid: 'job-1' },
      }),
      () => ({
        body: { uuid: 'job-1', current_status: 'PROCESSING' },
      }),
      () => ({
        body: { uuid: 'job-1', current_status: 'COMPLETED' },
      }),
    ]);

    const { taskId } = await createGenerateTask(store, ctx);

    const working = await store.getTask(taskId);
    expect(working?.status).toBe('working');
    expect(working?.statusMessage).toContain('processing');

    const completed = await store.getTask(taskId);
    expect(completed?.status).toBe('completed');

    const result = payloadOf<{ success: boolean; scenario_uuid: string; job_status: string }>(
      await store.getTaskResult(taskId)
    );
    expect(result.success).toBe(true);
    expect(result.scenario_uuid).toBe('s1');
    expect(result.job_status).toBe('COMPLETED');
  });

  it('stores a structured tool error when generation fails', async () => {
    const store = new VerifyaxTaskStore();
    const ctx = sequentialStubContext([
      () => ({
        body: { uuid: 's2', job_uuid: 'job-2' },
      }),
      () => ({
        body: {
          uuid: 'job-2',
          current_status: 'FAILED',
          error_details: 'tags do not exist in the skill tags registry',
        },
      }),
    ]);

    const { taskId } = await createGenerateTask(store, ctx);
    const task = await store.getTask(taskId);
    expect(task?.status).toBe('completed');

    const result = await store.getTaskResult(taskId);
    const payload = payloadOf<{ success: boolean; reason: string }>(result);
    expect(result.isError).toBe(true);
    expect(payload.reason).toContain('skill tags registry');
  });

  it('cancels a generation job cooperatively', async () => {
    const store = new VerifyaxTaskStore();
    const cancel = vi.fn(async () => undefined);
    const ctx = sequentialStubContext([
      () => ({
        body: { uuid: 's3', job_uuid: 'job-3' },
      }),
    ]);
    ctx.client.jobs.cancel = cancel;

    const { taskId } = await createGenerateTask(store, ctx);
    await store.updateTaskStatus(taskId, 'cancelled', 'Client cancelled');
    expect(cancel).toHaveBeenCalledWith('job-3');
  });

  it('refreshes evaluate_agent through run and evaluation phases', async () => {
    const store = new VerifyaxTaskStore();
    const ctx = sequentialStubContext([
      () => ({ body: { newRunEstimatedCredits: 5 } }),
      () => ({ body: { simulation_uuid: 'run-1', evaluation_job_uuid: 'eval-1' } }),
      () => ({ body: { uuid: 'run-1', status: 'IN_PROGRESS' } }),
      () => ({ body: { uuid: 'run-1', status: 'COMPLETED' } }),
      () => ({ body: { uuid: 'eval-1', current_status: 'PROCESSING' } }),
      () => ({ body: { uuid: 'eval-1', current_status: 'COMPLETED' } }),
      () => ({ body: { uuid: 'run-1', status: 'COMPLETED' } }),
      () => ({ body: { overall_score: 0.91 } }),
    ]);

    const started = await startEvaluateAgent(ctx, {
      agent_uuid: 'agent-1',
      scenario_uuid: 'scenario-1',
    });
    const task = await store.createTask({ ttl: 3_600_000, pollInterval: 100 }, 2, {
      method: 'tools/call',
      params: { name: 'evaluate_agent' },
    } as Request);
    store.setWork(task.taskId, {
      kind: 'evaluate_agent',
      ctx,
      simulationUuid: started.simulationUuid,
      creditsEstimate: started.creditsEstimate,
      phase: 'run',
      evalJobUuid: started.evalJobUuid,
    });

    expect((await store.getTask(task.taskId))?.status).toBe('working');
    expect((await store.getTask(task.taskId))?.status).toBe('working');
    const completed = await store.getTask(task.taskId);
    expect(completed?.status).toBe('completed');

    const payload = payloadOf<{
      success: boolean;
      simulation_uuid: string;
      evaluation: { overall_score: number };
    }>(await store.getTaskResult(task.taskId));
    expect(payload.success).toBe(true);
    expect(payload.simulation_uuid).toBe('run-1');
    expect(payload.evaluation.overall_score).toBe(0.91);
  });

  it('surfaces a failed simulation run as a structured tool error', async () => {
    const store = new VerifyaxTaskStore();
    const ctx = sequentialStubContext([
      () => ({ body: { newRunEstimatedCredits: 5 } }),
      () => ({ body: { simulation_uuid: 'run-fail' } }),
      () => ({
        body: { uuid: 'run-fail', status: 'FAILED', error_details: 'agent unreachable' },
      }),
    ]);

    const started = await startEvaluateAgent(ctx, {
      agent_uuid: 'agent-1',
      scenario_uuid: 'scenario-1',
    });
    const task = await store.createTask({ ttl: 3_600_000, pollInterval: 100 }, 4, {
      method: 'tools/call',
      params: { name: 'evaluate_agent' },
    } as Request);
    store.setWork(task.taskId, {
      kind: 'evaluate_agent',
      ctx,
      simulationUuid: started.simulationUuid,
      creditsEstimate: started.creditsEstimate,
      phase: 'run',
    });

    const terminal = await store.getTask(task.taskId);
    expect(terminal?.status).toBe('completed');
    const result = await store.getTaskResult(task.taskId);
    expect(result.isError).toBe(true);
  });

  it('resolves evaluation job from evaluation_jobs[] when scalars are absent', async () => {
    const store = new VerifyaxTaskStore();
    const ctx = sequentialStubContext([
      () => ({ body: { newRunEstimatedCredits: 3 } }),
      () => ({ body: { simulation_uuid: 'run-3' } }),
      () => ({
        body: {
          uuid: 'run-3',
          status: 'COMPLETED',
          evaluation_jobs: [{ uuid: 'eval-0' }, { uuid: 'eval-3' }],
        },
      }),
      () => ({ body: { uuid: 'eval-3', current_status: 'COMPLETED' } }),
      () => ({ body: { overall_score: 0.5 } }),
    ]);

    const started = await startEvaluateAgent(ctx, {
      agent_uuid: 'agent-1',
      scenario_uuid: 'scenario-1',
    });
    const task = await store.createTask({ ttl: 3_600_000, pollInterval: 100 }, 5, {
      method: 'tools/call',
      params: { name: 'evaluate_agent' },
    } as Request);
    store.setWork(task.taskId, {
      kind: 'evaluate_agent',
      ctx,
      simulationUuid: started.simulationUuid,
      creditsEstimate: started.creditsEstimate,
      phase: 'run',
    });

    const completed = await store.getTask(task.taskId);
    expect(completed?.status).toBe('completed');
    const payload = payloadOf<{ evaluation: { overall_score: number } }>(
      await store.getTaskResult(task.taskId)
    );
    expect(payload.evaluation.overall_score).toBe(0.5);
  });

  it('returns batch fields when batch generation completes', async () => {
    const store = new VerifyaxTaskStore();
    const ctx = sequentialStubContext([
      () => ({
        body: {
          uuid: 's-batch',
          job_uuid: 'job-batch',
          batch_uuid: 'batch-1',
          batch_scenario_uuids: ['s-batch', 's-batch-2'],
        },
      }),
      () => ({ body: { uuid: 'job-batch', current_status: 'COMPLETED' } }),
    ]);

    const started = await startGenerateScenario(ctx, {
      name: 'batch',
      scenario_type: 'info_exchange',
      num_scenarios: 2,
      tag_pool: ['empathy'],
    });
    const task = await store.createTask({ ttl: 3_600_000, pollInterval: 100 }, 6, {
      method: 'tools/call',
      params: { name: 'generate_scenario' },
    } as Request);
    store.setWork(task.taskId, {
      kind: 'generate_scenario',
      ctx,
      scenarioUuid: started.scenarioUuid,
      jobUuid: started.jobUuid,
      scenarioType: 'info_exchange',
      isBatch: true,
      batchUuid: started.batchUuid,
      batchScenarioUuids: started.batchScenarioUuids,
    });

    await store.getTask(task.taskId);
    const payload = payloadOf<{
      batch_uuid: string;
      batch_scenario_uuids: string[];
    }>(await store.getTaskResult(task.taskId));
    expect(payload.batch_uuid).toBe('batch-1');
    expect(payload.batch_scenario_uuids).toEqual(['s-batch', 's-batch-2']);
  });

  it('polls evaluation through refreshEvalPhase when phase is already eval', async () => {
    const store = new VerifyaxTaskStore();
    const ctx = sequentialStubContext([
      () => ({ body: { uuid: 'eval-5', current_status: 'PROCESSING' } }),
      () => ({ body: { uuid: 'eval-5', current_status: 'COMPLETED' } }),
      () => ({ body: { uuid: 'run-5', status: 'COMPLETED' } }),
      () => ({ body: { overall_score: 0.77 } }),
    ]);

    const task = await store.createTask({ ttl: 3_600_000, pollInterval: 100 }, 7, {
      method: 'tools/call',
      params: { name: 'evaluate_agent' },
    } as Request);
    store.setWork(task.taskId, {
      kind: 'evaluate_agent',
      ctx,
      simulationUuid: 'run-5',
      creditsEstimate: 1,
      phase: 'eval',
      evalJobUuid: 'eval-5',
    });

    expect((await store.getTask(task.taskId))?.status).toBe('working');
    expect((await store.getTask(task.taskId))?.status).toBe('completed');
  });

  it('surfaces a failed evaluation job', async () => {
    const store = new VerifyaxTaskStore();
    const ctx = sequentialStubContext([
      () => ({
        body: {
          uuid: 'eval-fail',
          current_status: 'FAILED',
          error_details: 'ground truth missing',
        },
      }),
      () => ({ body: { uuid: 'run-6', status: 'COMPLETED' } }),
    ]);

    const task = await store.createTask({ ttl: 3_600_000, pollInterval: 100 }, 8, {
      method: 'tools/call',
      params: { name: 'evaluate_agent' },
    } as Request);
    store.setWork(task.taskId, {
      kind: 'evaluate_agent',
      ctx,
      simulationUuid: 'run-6',
      creditsEstimate: null,
      phase: 'eval',
      evalJobUuid: 'eval-fail',
    });

    const terminal = await store.getTask(task.taskId);
    expect(terminal?.status).toBe('completed');
    const result = await store.getTaskResult(task.taskId);
    expect(result.isError).toBe(true);
  });

  it('triggers evaluation when the run completes without an eval job uuid', async () => {
    const store = new VerifyaxTaskStore();
    const ctx = sequentialStubContext([
      () => ({ body: { newRunEstimatedCredits: 2 } }),
      () => ({ body: { simulation_uuid: 'run-7' } }),
      () => ({ body: { uuid: 'run-7', status: 'COMPLETED' } }),
      () => ({ body: { evaluation_job_uuid: 'eval-7', job_uuid: 'eval-7' } }),
      () => ({ body: { uuid: 'eval-7', current_status: 'COMPLETED' } }),
      () => ({ body: { overall_score: 0.66 } }),
    ]);

    const started = await startEvaluateAgent(ctx, {
      agent_uuid: 'agent-1',
      scenario_uuid: 'scenario-1',
    });
    const task = await store.createTask({ ttl: 3_600_000, pollInterval: 100 }, 9, {
      method: 'tools/call',
      params: { name: 'evaluate_agent' },
    } as Request);
    store.setWork(task.taskId, {
      kind: 'evaluate_agent',
      ctx,
      simulationUuid: started.simulationUuid,
      creditsEstimate: started.creditsEstimate,
      phase: 'run',
    });

    expect((await store.getTask(task.taskId))?.status).toBe('completed');
  });

  it('fails when evaluation cannot be triggered after a completed run', async () => {
    const store = new VerifyaxTaskStore();
    const ctx = sequentialStubContext([
      () => ({ body: { newRunEstimatedCredits: 2 } }),
      () => ({ body: { simulation_uuid: 'run-8' } }),
      () => ({ body: { uuid: 'run-8', status: 'COMPLETED' } }),
      () => null,
    ]);

    const started = await startEvaluateAgent(ctx, {
      agent_uuid: 'agent-1',
      scenario_uuid: 'scenario-1',
    });
    const task = await store.createTask({ ttl: 3_600_000, pollInterval: 100 }, 10, {
      method: 'tools/call',
      params: { name: 'evaluate_agent' },
    } as Request);
    store.setWork(task.taskId, {
      kind: 'evaluate_agent',
      ctx,
      simulationUuid: started.simulationUuid,
      creditsEstimate: started.creditsEstimate,
      phase: 'run',
    });

    const terminal = await store.getTask(task.taskId);
    expect(terminal?.status).toBe('completed');
    const result = await store.getTaskResult(task.taskId);
    expect(result.isError).toBe(true);
  });

  it('marks the task failed when eval phase lacks a job uuid', async () => {
    const store = new VerifyaxTaskStore();
    const ctx = sequentialStubContext([]);
    const task = await store.createTask({ ttl: 3_600_000, pollInterval: 100 }, 11, {
      method: 'tools/call',
      params: { name: 'evaluate_agent' },
    } as Request);
    store.setWork(task.taskId, {
      kind: 'evaluate_agent',
      ctx,
      simulationUuid: 'run-9',
      creditsEstimate: null,
      phase: 'eval',
    });

    const terminal = await store.getTask(task.taskId);
    expect(terminal?.status).toBe('failed');
  });

  it('logs and continues when VerifyAX cancel fails', async () => {
    const store = new VerifyaxTaskStore();
    const ctx = sequentialStubContext([
      () => ({ body: { uuid: 's-cancel', job_uuid: 'job-cancel' } }),
    ]);
    ctx.client.jobs.cancel = vi.fn(async () => {
      throw new Error('cancel rejected');
    });

    const { taskId } = await createGenerateTask(store, ctx);
    await expect(
      store.updateTaskStatus(taskId, 'cancelled', 'Client cancelled')
    ).resolves.toBeUndefined();
    expect(ctx.client.jobs.cancel).toHaveBeenCalledWith('job-cancel');
  });

  it('passes through getTask when no VerifyAX work is registered', async () => {
    const store = new VerifyaxTaskStore();
    const task = await store.createTask({ ttl: 60_000 }, 99, {
      method: 'tools/call',
      params: {},
    } as Request);
    const fetched = await store.getTask(task.taskId);
    expect(fetched?.taskId).toBe(task.taskId);
    expect(fetched?.status).toBe('working');
    store.cleanup();
  });

  it('cancels an evaluation simulation cooperatively', async () => {
    const store = new VerifyaxTaskStore();
    const cancel = vi.fn(async () => undefined);
    const ctx = sequentialStubContext([
      () => ({ body: { newRunEstimatedCredits: 5 } }),
      () => ({ body: { simulation_uuid: 'run-2' } }),
    ]);
    ctx.client.simulations.cancel = cancel;

    const started = await startEvaluateAgent(ctx, {
      agent_uuid: 'agent-1',
      scenario_uuid: 'scenario-1',
    });
    const task = await store.createTask({ ttl: 3_600_000, pollInterval: 100 }, 3, {
      method: 'tools/call',
      params: { name: 'evaluate_agent' },
    } as Request);
    store.setWork(task.taskId, {
      kind: 'evaluate_agent',
      ctx,
      simulationUuid: started.simulationUuid,
      creditsEstimate: started.creditsEstimate,
      phase: 'run',
    });

    await store.updateTaskStatus(task.taskId, 'cancelled', 'Client cancelled');
    expect(cancel).toHaveBeenCalledWith('run-2');
  });

  it('cancels an evaluation job cooperatively when in eval phase', async () => {
    const store = new VerifyaxTaskStore();
    const simCancel = vi.fn(async () => undefined);
    const jobCancel = vi.fn(async () => undefined);
    const ctx = sequentialStubContext([
      () => ({ body: { newRunEstimatedCredits: 5 } }),
      () => ({ body: { simulation_uuid: 'run-3' } }),
    ]);
    ctx.client.simulations.cancel = simCancel;
    ctx.client.jobs.cancel = jobCancel;

    const started = await startEvaluateAgent(ctx, {
      agent_uuid: 'agent-1',
      scenario_uuid: 'scenario-1',
    });
    const task = await store.createTask({ ttl: 3_600_000, pollInterval: 100 }, 4, {
      method: 'tools/call',
      params: { name: 'evaluate_agent' },
    } as Request);
    store.setWork(task.taskId, {
      kind: 'evaluate_agent',
      ctx,
      simulationUuid: started.simulationUuid,
      creditsEstimate: started.creditsEstimate,
      phase: 'eval',
      evalJobUuid: 'eval-job-1',
    });

    await store.updateTaskStatus(task.taskId, 'cancelled', 'Client cancelled');
    expect(jobCancel).toHaveBeenCalledWith('eval-job-1');
    expect(simCancel).not.toHaveBeenCalled();
  });

  it('does not overwrite a cancelled task when an in-flight refresh completes', async () => {
    const store = new VerifyaxTaskStore();
    let releaseJobGet!: () => void;
    const blockedJobGet = new Promise<void>((resolve) => {
      releaseJobGet = resolve;
    });
    let jobGets = 0;

    const client = new VerifyaxClient({
      apiKey: 'test',
      baseUrl: 'https://api.test/api/v1',
      webBaseUrl: 'https://api.test/web/api/v1',
      maxRetries: 0,
      fetch: async (url, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'GET' && url.includes('/jobs/job-race')) {
          jobGets += 1;
          if (jobGets === 1) {
            await blockedJobGet;
          }
          return new Response(JSON.stringify({ uuid: 'job-race', current_status: 'COMPLETED' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (method === 'POST' && url.includes('/scenarios/generate')) {
          return new Response(JSON.stringify({ uuid: 's-race', job_uuid: 'job-race' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ message: 'unexpected' }), { status: 599 });
      },
    });
    const ctx: ToolContext = { client, logger: createLogger({ level: 'silent' }) };

    const { taskId } = await createGenerateTask(store, ctx);
    const refresh = store.getTask(taskId);
    await vi.waitFor(() => {
      expect(jobGets).toBe(1);
    });

    await store.updateTaskStatus(taskId, 'cancelled', 'Client cancelled');
    releaseJobGet();
    await refresh;

    const task = await store.getTask(taskId);
    expect(task?.status).toBe('cancelled');
    expect(task?.statusMessage).toBe('Client cancelled');
  });

  it('serializes concurrent getTask refreshes so triggerEvaluation runs once', async () => {
    const store = new VerifyaxTaskStore();
    const triggerEvaluation = vi.fn(async () => ({
      evaluation_job_uuid: 'eval-once',
      job_uuid: 'eval-once',
    }));
    let releaseRunGet!: () => void;
    const blockedRunGet = new Promise<void>((resolve) => {
      releaseRunGet = resolve;
    });
    let runGets = 0;

    const client = new VerifyaxClient({
      apiKey: 'test',
      baseUrl: 'https://api.test/api/v1',
      webBaseUrl: 'https://api.test/web/api/v1',
      maxRetries: 0,
      fetch: async (url, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'GET' && url.includes('/simulations/run-race')) {
          runGets += 1;
          if (runGets === 1) {
            await blockedRunGet;
          }
          return new Response(JSON.stringify({ uuid: 'run-race', status: 'COMPLETED' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (method === 'GET' && url.includes('/jobs/eval-once')) {
          return new Response(JSON.stringify({ uuid: 'eval-once', current_status: 'COMPLETED' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (method === 'GET' && url.includes('/simulations/evaluations/eval-once')) {
          return new Response(JSON.stringify({ overall_score: 0.8 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (method === 'POST' && url.includes('/engine/workspace-credit-preview')) {
          return new Response(JSON.stringify({ newRunEstimatedCredits: 1 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (method === 'POST' && url.includes('/engine/simulate/scenario')) {
          return new Response(JSON.stringify({ simulation_uuid: 'run-race' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ message: 'unexpected' }), { status: 599 });
      },
    });
    client.simulations.triggerEvaluation = triggerEvaluation;
    const ctx: ToolContext = { client, logger: createLogger({ level: 'silent' }) };

    const started = await startEvaluateAgent(ctx, {
      agent_uuid: 'agent-1',
      scenario_uuid: 'scenario-1',
    });
    const task = await store.createTask({ ttl: 3_600_000, pollInterval: 100 }, 12, {
      method: 'tools/call',
      params: { name: 'evaluate_agent' },
    } as Request);
    store.setWork(task.taskId, {
      kind: 'evaluate_agent',
      ctx,
      simulationUuid: started.simulationUuid,
      creditsEstimate: started.creditsEstimate,
      phase: 'run',
    });

    const first = store.getTask(task.taskId);
    await vi.waitFor(() => {
      expect(runGets).toBe(1);
    });
    const second = store.getTask(task.taskId);
    releaseRunGet();
    await Promise.all([first, second]);

    expect(triggerEvaluation).toHaveBeenCalledTimes(1);
    expect(triggerEvaluation).toHaveBeenCalledWith('run-race');
  });
});
