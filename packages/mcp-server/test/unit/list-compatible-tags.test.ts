import type { Tag } from '@verifyax/sdk';
import { describe, expect, it } from 'vitest';
import { filterCompatibleTags } from '../../src/tools/list-compatible-tags.js';

const tags: Tag[] = [
  { name: 'empathy', allowed_scenario_types: ['info_exchange', 'interview'] },
  { name: 'active_listening', allowed_scenario_types: ['interview'] },
  { name: 'coordination', allowed_scenario_types: ['info_exchange'] },
  { name: 'legacy', benchmark_family: null }, // omitted allowed types => both
  { name: 'gaia_task', benchmark_family: 'gaia', allowed_scenario_types: ['info_exchange'] },
  { name: 'qna_general', benchmark_family: 'qna', allowed_scenario_types: ['interview'] },
  { name: 'not_selectable', allowed_scenario_types: [] },
];

describe('filterCompatibleTags', () => {
  it('keeps interview-compatible tags and drops the rest', () => {
    const names = filterCompatibleTags(tags, 'interview').map((t) => t.name);
    expect(names).toContain('empathy');
    expect(names).toContain('active_listening');
    expect(names).toContain('legacy'); // omitted => both types
    expect(names).toContain('qna_general'); // qna => interview only
    expect(names).not.toContain('coordination'); // info_exchange only
    expect(names).not.toContain('gaia_task'); // benchmark => info_exchange only
    expect(names).not.toContain('not_selectable'); // [] => never
  });

  it('keeps info_exchange-compatible tags and drops the rest', () => {
    const names = filterCompatibleTags(tags, 'info_exchange').map((t) => t.name);
    expect(names).toContain('empathy');
    expect(names).toContain('coordination');
    expect(names).toContain('legacy');
    expect(names).toContain('gaia_task'); // benchmark => info_exchange
    expect(names).not.toContain('active_listening'); // interview only
    expect(names).not.toContain('qna_general'); // qna => interview only
    expect(names).not.toContain('not_selectable');
  });
});
