import { describe, expect, it } from 'vitest';
import { createGetRunOutputHandler, shapeRunOutput } from '../../src/tools/get-run-output.js';
import { payloadOf, stubContext } from './helpers.js';

describe('shapeRunOutput', () => {
  it('returns full output when under the default cap', () => {
    const shaped = shapeRunOutput({ messages: [{ role: 'user', content: 'hi' }] }, 12_000);
    expect(shaped.truncated).toBe(false);
    expect(shaped.turns_included).toBe(1);
    expect(shaped.turns_omitted).toBe(0);
  });

  it('excerpt message lists with turns omitted', () => {
    const messages = Array.from({ length: 50 }, (_, i) => ({
      role: 'user',
      content: `turn-${String(i)}-${'x'.repeat(200)}`,
    }));
    const shaped = shapeRunOutput({ messages }, 500);
    expect(shaped.truncated).toBe(true);
    expect(shaped.turns_included).toBeGreaterThan(0);
    expect(shaped.turns_omitted).toBeGreaterThan(0);
    expect((shaped.turns_included as number) + (shaped.turns_omitted as number)).toBe(50);
  });

  it('truncates non-message JSON with omitted_chars', () => {
    const shaped = shapeRunOutput({ blob: 'y'.repeat(20_000) }, 100);
    expect(shaped.truncated).toBe(true);
    expect(shaped.omitted_chars).toBeGreaterThan(0);
    expect(shaped.truncation_note).toBeTruthy();
  });

  it('flattens rounds[].messages for turn excerpting', () => {
    const shaped = shapeRunOutput(
      {
        rounds: [
          { messages: [{ role: 'a', content: 'one' }] },
          { messages: [{ role: 'b', content: 'two' }] },
        ],
      },
      12_000
    );
    expect(shaped.truncated).toBe(false);
    expect(shaped.turns_included).toBe(2);
  });
});

describe('get_run_output', () => {
  it('fetches output with default max_chars cap', async () => {
    const { ctx } = stubContext([
      {
        method: 'GET',
        match: '/simulations/run-1/output',
        body: { messages: [{ role: 'user', content: 'hello' }] },
      },
    ]);
    const payload = payloadOf<{ success: boolean; max_chars: number; truncated: boolean }>(
      await createGetRunOutputHandler(ctx)({ simulation_uuid: 'run-1' })
    );

    expect(payload.success).toBe(true);
    expect(payload.max_chars).toBe(12_000);
    expect(payload.truncated).toBe(false);
  });

  it('honors an explicit max_chars argument', async () => {
    const { ctx } = stubContext([
      {
        method: 'GET',
        match: '/simulations/run-2/output',
        body: { note: 'z'.repeat(500) },
      },
    ]);
    const payload = payloadOf<{ max_chars: number; truncated: boolean }>(
      await createGetRunOutputHandler(ctx)({ simulation_uuid: 'run-2', max_chars: 80 })
    );

    expect(payload.max_chars).toBe(80);
    expect(payload.truncated).toBe(true);
  });

  it('returns structured not found for an unknown run', async () => {
    const { ctx } = stubContext([
      {
        method: 'GET',
        match: '/simulations/missing/output',
        status: 404,
        body: { message: 'not found' },
      },
    ]);
    const payload = payloadOf<{ success: boolean; reason: string }>(
      await createGetRunOutputHandler(ctx)({ simulation_uuid: 'missing' })
    );

    expect(payload.success).toBe(false);
    expect(payload.reason).toContain('Not found');
  });
});
