import { describe, expect, it } from 'vitest';
import { getToolsForSurface } from '../../tool-registry';
import { AGENT_WORK_OBJECT_TOOLS } from './work-objects.tools';

describe('Agent work-object contracts', () => {
  it('keeps every extracted work-object tool available exactly once to Agent', () => {
    const names = getToolsForSurface('agent').map((tool) => tool.name);
    expect(AGENT_WORK_OBJECT_TOOLS.map((tool) => tool.name)).toEqual([
      'request_input',
      'present_work_object',
      'ingest_source_media',
    ]);
    for (const tool of AGENT_WORK_OBJECT_TOOLS) {
      expect(names.filter((name) => name === tool.name)).toHaveLength(1);
    }
  });
});
