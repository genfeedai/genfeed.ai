import { describe, expect, it } from 'vitest';
import {
  buildWorkflowGenerationMessages,
  buildWorkflowGenerationNodeTypes,
  parseUnenforcedWorkflowGeneration,
  workflowGenerationSchema,
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
          type: 'genfeedAction',
          workflowActionId: 'imageGen',
        },
      ],
      description: 'Generate an image workflow',
      targetPlatforms: ['instagram'],
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toContain('imageGen');
    expect(messages[0]?.content).toContain('instagram');
    expect(messages[1]).toEqual({
      content: 'Generate an image workflow',
      role: 'user',
    });
  });

  it('includes catalog actions in the generator vocabulary without a static list', () => {
    const nodeTypes = buildWorkflowGenerationNodeTypes();
    const actionIds = nodeTypes.map((node) => node.workflowActionId);
    expect(actionIds).toEqual(
      expect.arrayContaining([
        'socialRead',
        'reportDelivery',
        'talkingHeadScript',
        'imageGen',
      ]),
    );
    expect(nodeTypes.some((node) => node.type === 'workflowInput')).toBe(true);
    expect(
      nodeTypes
        .filter((node) => node.workflowActionId)
        .every((node) => node.type === 'genfeedAction'),
    ).toBe(true);
  });

  it('stops instructing the model to return bare JSON', () => {
    const [systemMessage] = buildWorkflowGenerationMessages({
      availableNodeTypes: [],
      description: 'Generate a generic workflow',
    });

    expect(systemMessage?.content).not.toContain('Return ONLY the JSON object');
    expect(systemMessage?.content).not.toContain('markdown fences');
  });

  it('refuses an edge missing its handles', () => {
    expect(
      workflowGenerationSchema.safeParse({
        description: '',
        edges: [{ id: 'edge-1', source: 'a', target: 'b' }],
        name: 'Workflow',
        nodes: [
          {
            data: {},
            id: 'a',
            position: { x: 0, y: 0 },
            type: 'genfeedAction',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('accepts an unfenced graph from a provider that cannot enforce JSON', () => {
    const graph = {
      description: 'Posts an image',
      edges: [],
      name: 'Workflow',
      nodes: [
        {
          data: { label: 'Generate' },
          id: 'node-1',
          position: { x: 0, y: 0 },
          type: 'genfeedAction',
        },
      ],
    };

    expect(parseUnenforcedWorkflowGeneration(JSON.stringify(graph))).toEqual(
      graph,
    );
  });

  it('still refuses a fenced graph that does not match the schema', () => {
    expect(() =>
      parseUnenforcedWorkflowGeneration('```json\n{"name":"Half"}\n```'),
    ).toThrow();
  });
});
