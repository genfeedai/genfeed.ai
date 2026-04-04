import { describe, expect, it } from 'vitest';
import { repairWorkflowJSON } from './workflow-validation';

describe('repairWorkflowJSON', () => {
  it('drops invalid legacy node types instead of rewriting them', () => {
    const repaired = repairWorkflowJSON({
      description: '',
      edges: [
        {
          id: 'edge-1',
          source: 'legacy-node',
          sourceHandle: 'text',
          target: 'prompt-node',
          targetHandle: 'prompt',
        },
      ],
      name: 'Test Workflow',
      nodes: [
        {
          data: {},
          id: 'legacy-node',
          position: { x: 0, y: 0 },
          type: 'text_input',
        },
        {
          data: { label: 'Prompt', prompt: '', status: 'idle' },
          id: 'prompt-node',
          position: { x: 120, y: 0 },
          type: 'prompt',
        },
      ],
    });

    expect(repaired.nodes).toEqual([
      expect.objectContaining({
        id: 'prompt-node',
        type: 'prompt',
      }),
    ]);
    expect(repaired.edges).toEqual([]);
  });
});
