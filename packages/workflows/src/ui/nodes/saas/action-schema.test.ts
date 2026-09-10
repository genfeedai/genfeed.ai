import type { GenfeedActionDefinition } from '@genfeedai/actions';
import { describe, expect, it } from 'vitest';
import {
  createActionVisualDefinition,
  readActionObjectSchema,
  selectOnNodeProperties,
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
      ],
    });
  });

  it('collapses fat object outputs to one typed port', () => {
    const definition = createActionVisualDefinition({
      ...action,
      inputSchema: {
        properties: { state: { type: 'object' } },
        required: ['state'],
        type: 'object',
      },
      outputSchema: {
        properties: {
          accountLabel: { type: 'string' },
          credentialId: { type: 'string' },
          outcome: { type: 'string' },
          platform: { type: 'string' },
          postId: { type: 'string' },
          score: { type: 'number' },
          slotKey: { type: 'string' },
        },
        required: ['credentialId', 'platform', 'accountLabel', 'slotKey'],
        type: 'object',
      },
    });

    expect(definition.inputs.map((handle) => handle.id)).toEqual(['state']);
    expect(definition.outputs).toEqual([
      {
        id: 'output',
        label: 'Output',
        multiple: false,
        optional: false,
        required: false,
        type: 'object',
      },
    ]);
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

  it('picks a compact set of on-node fields and skips identity or media', () => {
    expect(
      Object.keys(
        selectOnNodeProperties({
          properties: {
            brandId: { type: 'string' },
            credentialId: { type: 'string' },
            image: { type: 'string' },
            limit: { type: 'integer' },
            platform: { type: 'string' },
            query: { type: 'string' },
            username: { type: 'string' },
          },
          type: 'object',
        }),
      ),
    ).toEqual(['query', 'username', 'platform', 'limit']);
  });
});
