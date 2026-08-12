import { describe, expect, it } from 'vitest';
import {
  buildWorkflowGenerationMessages,
  DEFAULT_WORKFLOW_GENERATION_NODE_TYPES,
  parseWorkflowGenerationResponse,
} from '.';

describe('workflow generation shared helpers', () => {
  it('builds provider-agnostic workflow generation messages', () => {
    const messages = buildWorkflowGenerationMessages({
      availableNodeTypes: [
        {
          category: 'generation',
          description: 'Generate image',
          inputs: ['prompt'],
          outputs: ['imageUrl'],
          type: 'image_gen',
        },
      ],
      description: 'Generate an image workflow',
      targetPlatforms: ['instagram'],
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toContain('image_gen');
    expect(messages[0]?.content).toContain('instagram');
    expect(messages[1]).toEqual({
      content: 'Generate an image workflow',
      role: 'user',
    });
  });

  it('includes socialRead and reportDelivery in the generator vocabulary (#2664)', () => {
    const types = DEFAULT_WORKFLOW_GENERATION_NODE_TYPES.map(
      (node) => node.type,
    );
    expect(types).toEqual(
      expect.arrayContaining(['socialRead', 'reportDelivery']),
    );
  });

  it('parses generated workflow JSON', () => {
    expect(
      parseWorkflowGenerationResponse(
        JSON.stringify({ edges: [], name: 'Workflow', nodes: [] }),
      ).workflow,
    ).toEqual({ edges: [], name: 'Workflow', nodes: [] });
  });
});
