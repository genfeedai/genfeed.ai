import { describe, expect, it } from 'vitest';
import { getActionDefinition } from '../../action-registry';
import { getToolsForSurface } from '../../tool-registry';
import { AGENT_WORK_OBJECT_TOOLS } from './work-objects.tools';

describe('Agent work-object contracts', () => {
  it('requires one to five selectable choices in the exposed request-input schema', () => {
    expect(getActionDefinition('request_input')?.inputSchema).toMatchObject({
      properties: {
        options: {
          items: { required: ['id', 'label'], type: 'object' },
          maxItems: 5,
          minItems: 1,
          type: 'array',
        },
      },
      required: expect.arrayContaining(['options']),
    });
  });

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
