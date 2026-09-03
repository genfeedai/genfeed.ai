import { ALL_ACTIONS } from '@genfeedai/actions';
import { describe, expect, it } from 'vitest';
import {
  ACTION_NODE_DEFINITIONS,
  buildActionNodeDefinitions,
} from './action-node-definitions';
import { ENGINE_NATIVE_NODE_DEFINITIONS } from './engine-native-definitions';
import { NODE_DEFINITIONS } from './merged-registry';

describe('ACTION_NODE_DEFINITIONS', () => {
  it('derives one builder definition for every workflow-visible action', () => {
    const workflowActions = ALL_ACTIONS.filter(
      (action) => action.visibility === 'workflow',
    );

    expect(Object.keys(ACTION_NODE_DEFINITIONS).sort()).toEqual(
      workflowActions.map((action) => action.id).sort(),
    );

    for (const action of workflowActions) {
      const definition = ACTION_NODE_DEFINITIONS[action.id];
      expect(definition, action.id).toMatchObject({
        description: action.description,
        label: action.label,
        type: action.id,
      });
      expect(definition?.icon.length).toBeGreaterThan(0);
      expect(Array.isArray(definition?.inputs)).toBe(true);
      expect(Array.isArray(definition?.outputs)).toBe(true);
    }
  });

  it('exposes a new catalog action without a second inventory edit', () => {
    const generated = buildActionNodeDefinitions([
      {
        approval: 'none',
        authorization: 'user',
        completionMode: 'synchronous',
        credits: { amount: 0, mode: 'fixed' },
        description: 'Generated fixture action',
        id: 'fixtureCatalogAction',
        idempotency: 'run-node',
        inputSchema: {
          properties: {
            prompt: { title: 'Prompt', type: 'string' },
            productContext: { type: 'string' },
          },
          required: ['prompt'],
          type: 'object',
        },
        label: 'Fixture Catalog Action',
        outputSchema: {
          properties: { fullText: { type: 'string' } },
          type: 'object',
        },
        visibility: 'workflow',
        workflowCategory: 'ai',
        workflowIcon: 'Sparkles',
      },
    ]);

    expect(generated.fixtureCatalogAction).toMatchObject({
      category: 'ai',
      icon: 'Sparkles',
      label: 'Fixture Catalog Action',
      type: 'fixtureCatalogAction',
    });
    expect(generated.fixtureCatalogAction?.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'prompt',
          required: true,
          type: 'text',
        }),
        expect.objectContaining({ id: 'productContext', type: 'text' }),
      ]),
    );
    expect(generated.fixtureCatalogAction?.outputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'fullText', type: 'text' }),
      ]),
    );
  });

  it('unwraps anyOf output schemas so trendTrigger exposes topic', () => {
    expect(
      ACTION_NODE_DEFINITIONS.trendTrigger?.outputs.map((output) => output.id),
    ).toEqual(expect.arrayContaining(['topic', 'platform', 'trendId']));
  });

  it('declares content-loop promptConstructor guidance handles', () => {
    expect(
      ACTION_NODE_DEFINITIONS.promptConstructor?.inputs.map(
        (input) => input.id,
      ),
    ).toEqual(
      expect.arrayContaining(['avoid', 'brandVoice', 'hooks', 'topic']),
    );
  });

  it('keeps talking-head script ports on the catalog contract', () => {
    expect(
      ACTION_NODE_DEFINITIONS.talkingHeadScript?.inputs.map(
        (input) => input.id,
      ),
    ).toEqual(
      expect.arrayContaining([
        'productContext',
        'durationSeconds',
        'clipCount',
        'wordsPerSecond',
      ]),
    );
    expect(
      ACTION_NODE_DEFINITIONS.talkingHeadScript?.outputs.map(
        (output) => output.id,
      ),
    ).toEqual(expect.arrayContaining(['script', 'segments', 'fullText']));
  });
});

describe('engine-native vs generated inventories', () => {
  it('does not duplicate engine-native types in the generated action map', () => {
    for (const type of Object.keys(ENGINE_NATIVE_NODE_DEFINITIONS)) {
      if (type === 'genfeedAction') {
        continue;
      }
      expect(ACTION_NODE_DEFINITIONS[type]).toBeUndefined();
    }
  });

  it('merges catalog actions into NODE_DEFINITIONS', () => {
    expect(NODE_DEFINITIONS.brand).toBeDefined();
    expect(NODE_DEFINITIONS.publish).toBeDefined();
    expect(NODE_DEFINITIONS.talkingHeadScript).toBeDefined();
    expect(NODE_DEFINITIONS.socialRead).toBeDefined();
    expect(NODE_DEFINITIONS.reportDelivery).toBeDefined();
    expect(NODE_DEFINITIONS.commentTrigger).toBeDefined();
    expect(NODE_DEFINITIONS.workflowInput).toBeDefined();
    expect(NODE_DEFINITIONS.genfeedAction).toBeDefined();
  });
});
