import type { GenfeedActionDefinition } from '@genfeedai/actions';
import { describe, expect, it } from 'vitest';
import {
  createActionVisualDefinition,
  readActionObjectSchema,
} from './action-schema';

const action: GenfeedActionDefinition = {
  approval: 'none',
  authorization: 'user',
  completionMode: 'synchronous',
  credits: { amount: 1, mode: 'fixed' },
  description: 'Creates one media result.',
  id: 'test.action',
  idempotency: 'run-node',
  inputSchema: {
    properties: {
      durationSeconds: { type: 'number' },
      prompt: { type: 'string' },
      referenceImages: { items: { type: 'string' }, type: 'array' },
    },
    required: ['prompt'],
    type: 'object',
  },
  label: 'Test Action',
  outputSchema: {
    properties: {
      imageUrl: { type: 'string' },
      score: { type: 'number' },
    },
    type: 'object',
  },
  visibility: 'workflow',
  workflowCategory: 'ai',
  workflowIcon: 'Sparkles',
};

describe('action schema visual adapter', () => {
  it('derives action-specific handles and presentation from the catalog', () => {
    expect(createActionVisualDefinition(action)).toEqual({
      category: 'ai',
      icon: 'Sparkles',
      inputs: [
        {
          id: 'durationSeconds',
          label: 'Duration Seconds',
          multiple: false,
          optional: true,
          required: false,
          type: 'number',
        },
        {
          id: 'prompt',
          label: 'Prompt',
          multiple: false,
          optional: false,
          required: true,
          type: 'text',
        },
        {
          id: 'referenceImages',
          label: 'Reference Images',
          multiple: true,
          optional: true,
          required: false,
          type: 'image',
        },
      ],
      label: 'Test Action',
      outputs: [
        {
          id: 'imageUrl',
          label: 'Image Url',
          multiple: false,
          optional: false,
          required: false,
          type: 'image',
        },
        {
          id: 'score',
          label: 'Score',
          multiple: false,
          optional: false,
          required: false,
          type: 'number',
        },
      ],
    });
  });

  it('unwraps nullable action properties without losing the field', () => {
    const schema = readActionObjectSchema({
      properties: {
        topic: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
      type: 'object',
    });

    expect(schema.properties.topic).toEqual({
      anyOf: [{ type: 'string' }, { type: 'null' }],
    });
  });
});
