import type { WorkflowJson } from '@api/services/telegram-bot/telegram-bot.types';
import {
  extractWorkflowInputs,
  toTelegramSystemWorkflowDefinition,
} from '@api/services/telegram-bot/telegram-workflow-loader';
import { describe, expect, it } from 'vitest';

const workflow: WorkflowJson = {
  description: 'Generates one image.',
  edges: [
    {
      id: 'input-to-generation',
      source: 'prompt',
      sourceHandle: 'text',
      target: 'generate',
      targetHandle: 'prompt',
    },
    {
      id: 'generation-to-output',
      source: 'generate',
      sourceHandle: 'imageUrl',
      target: 'output',
      targetHandle: 'image',
    },
  ],
  name: 'Single Image',
  nodes: [
    {
      data: {
        config: {
          defaultValue: 'A cinematic landscape',
          inputName: 'prompt',
          inputType: 'text',
          required: false,
        },
        label: 'Prompt',
      },
      id: 'prompt',
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          actionId: 'imageGen',
          parameters: { model: 'nano-banana-pro' },
        },
        label: 'Generate Image',
      },
      id: 'generate',
      type: 'genfeedAction',
    },
    {
      data: {
        config: {
          actionId: 'workflow.collect-output',
          parameters: { outputName: 'generated-image' },
        },
        label: 'Output',
      },
      id: 'output',
      type: 'genfeedAction',
    },
  ],
  version: 3,
};

describe('extractWorkflowInputs', () => {
  it('extracts only explicit workflow input nodes', () => {
    expect(extractWorkflowInputs(workflow)).toEqual([
      expect.objectContaining({
        defaultValue: 'A cinematic landscape',
        inputKey: 'prompt',
        inputType: 'text',
        label: 'Prompt',
        nodeId: 'prompt',
        required: false,
      }),
    ]);
  });

  it('rejects legacy product node types', () => {
    expect(() =>
      extractWorkflowInputs({
        ...workflow,
        nodes: [{ data: {}, id: 'legacy', type: 'imageGen' }],
      }),
    ).toThrow('unsupported non-action node imageGen');
  });
});

describe('toTelegramSystemWorkflowDefinition', () => {
  it('builds a hidden action graph with internal brand context', () => {
    const definition = toTelegramSystemWorkflowDefinition(
      'single-image',
      workflow,
    );

    expect(definition).toMatchObject({
      canonicalId: 'telegram.single-image',
      label: 'Single Image',
      resultNodeId: 'output',
      version: 3,
    });
    expect(definition.definition.inputVariables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'prompt', required: false }),
        expect.objectContaining({ key: 'brandId', required: true }),
      ]),
    );
    expect(
      definition.definition.nodes?.find((node) => node.id === 'generate'),
    ).toMatchObject({
      data: {
        config: {
          actionId: 'imageGen',
          parameters: { model: 'nano-banana-pro' },
        },
        inputVariableKeys: ['brandId'],
      },
      type: 'genfeedAction',
    });
  });

  it('requires one explicit terminal output action', () => {
    expect(() =>
      toTelegramSystemWorkflowDefinition('missing-output', {
        ...workflow,
        nodes: workflow.nodes.filter((node) => node.id !== 'output'),
      }),
    ).toThrow('must contain exactly one workflow.collect-output action');
  });
});
