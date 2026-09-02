import { describe, expect, it } from 'vitest';
import {
  buildWorkflowGenerationMessages,
  buildWorkflowGenerationNodeTypes,
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

  it('omits the platform constraint when no targets are provided', () => {
    const [systemMessage] = buildWorkflowGenerationMessages({
      availableNodeTypes: [],
      description: 'Generate a generic workflow',
    });

    expect(systemMessage?.content).not.toContain(
      'The workflow should target these platforms:',
    );
  });

  it('parses generated workflow JSON', () => {
    expect(
      parseWorkflowGenerationResponse(
        JSON.stringify({ edges: [], name: 'Workflow', nodes: [] }),
      ).workflow,
    ).toEqual({ edges: [], name: 'Workflow', nodes: [] });
  });

  it('parses an empty provider response as an empty workflow', () => {
    expect(parseWorkflowGenerationResponse('').workflow).toEqual({});
  });
});
