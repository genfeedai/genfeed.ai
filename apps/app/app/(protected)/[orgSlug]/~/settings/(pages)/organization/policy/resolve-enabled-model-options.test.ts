import { ModelCategory } from '@genfeedai/contracts';
import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import { describe, expect, it } from 'vitest';

import {
  AGENT_GENERATION_MODEL_CATEGORIES,
  AGENT_THINKING_MODEL_CATEGORIES,
  getUnresolvedOverrideKey,
  resolveEnabledModelOptions,
  resolveEnabledModelsForCategory,
  resolveStoredAgentModelKey,
} from './resolve-enabled-model-options';

const modelId = testId('model');

describe('resolveEnabledModelOptions', () => {
  it('uses catalog labels and persists keys, not row ids', () => {
    expect(
      resolveEnabledModelOptions(
        [modelId, 'google/gemini-2.5-flash-lite'],
        [
          {
            category: ModelCategory.TEXT,
            id: modelId,
            key: 'deepseek/deepseek-v4-flash-0731',
            label: 'DeepSeek V4 Flash',
          },
          {
            category: ModelCategory.TEXT,
            id: 'other-id',
            key: 'google/gemini-2.5-flash-lite',
            label: 'Gemini 2.5 Flash Lite',
          },
        ],
        AGENT_THINKING_MODEL_CATEGORIES,
      ),
    ).toEqual([
      { label: 'DeepSeek V4 Flash', value: 'deepseek/deepseek-v4-flash-0731' },
      {
        label: 'Gemini 2.5 Flash Lite',
        value: 'google/gemini-2.5-flash-lite',
      },
    ]);
  });

  it('drops unmatched allowlist ids instead of showing CUIDs', () => {
    expect(
      resolveEnabledModelOptions(
        [testId('unmatched')],
        [],
        AGENT_THINKING_MODEL_CATEGORIES,
      ),
    ).toEqual([]);
  });

  it('keeps thinking options on text models and generation options on media', () => {
    const models = [
      {
        category: ModelCategory.TEXT,
        id: 'text-id',
        key: 'deepseek/deepseek-v4-flash-0731',
        label: 'DeepSeek V4 Flash',
      },
      {
        category: ModelCategory.IMAGE,
        id: 'image-id',
        key: 'google/nano-banana-2',
        label: 'Nano Banana 2 Lite',
      },
    ];

    expect(
      resolveEnabledModelOptions(
        ['text-id', 'image-id'],
        models,
        AGENT_THINKING_MODEL_CATEGORIES,
      ),
    ).toEqual([
      { label: 'DeepSeek V4 Flash', value: 'deepseek/deepseek-v4-flash-0731' },
    ]);
    expect(
      resolveEnabledModelOptions(
        ['text-id', 'image-id'],
        models,
        AGENT_GENERATION_MODEL_CATEGORIES,
      ),
    ).toEqual([{ label: 'Nano Banana 2 Lite', value: 'google/nano-banana-2' }]);
  });

  it('maps a persisted row id onto the catalog key', () => {
    expect(
      resolveStoredAgentModelKey(modelId, [
        {
          id: modelId,
          key: 'deepseek/deepseek-v4-flash-0731',
        },
      ]),
    ).toBe('deepseek/deepseek-v4-flash-0731');
  });

  it('returns no options when the org has not enabled any models', () => {
    expect(
      resolveEnabledModelOptions(
        [],
        [
          {
            category: ModelCategory.TEXT,
            id: modelId,
            key: 'deepseek/deepseek-v4-flash-0731',
            label: 'DeepSeek V4 Flash',
          },
        ],
        AGENT_THINKING_MODEL_CATEGORIES,
      ),
    ).toEqual([]);
  });

  it('returns "" for a stored value with no match, instead of leaking the raw CUID through', () => {
    expect(
      resolveStoredAgentModelKey(modelId, [
        {
          id: 'a-different-id',
          key: 'deepseek/deepseek-v4-flash-0731',
        },
      ]),
    ).toBe('');
  });

  it('returns "" for an empty catalog (catalog not loaded yet), never the stored value', () => {
    expect(
      resolveStoredAgentModelKey('deepseek/deepseek-v4-flash-0731', []),
    ).toBe('');
  });

  it('does not resolve a key that is only enabled for a different selector category', () => {
    // The stored value is a valid catalog key, but it is an IMAGE model — the
    // caller must scope `models` per selector (see
    // resolveEnabledModelsForCategory) so a generation override can't leak
    // into the thinking/review selectors and vice versa.
    const models = [
      {
        category: ModelCategory.IMAGE,
        id: 'image-id',
        key: 'google/nano-banana-2',
        label: 'Nano Banana 2 Lite',
      },
    ];
    const scopedForThinking = resolveEnabledModelsForCategory(
      ['image-id'],
      models,
      AGENT_THINKING_MODEL_CATEGORIES,
    );

    expect(scopedForThinking).toEqual([]);
    expect(
      resolveStoredAgentModelKey('google/nano-banana-2', scopedForThinking),
    ).toBe('');
  });
});

describe('getUnresolvedOverrideKey', () => {
  it('returns null for an empty value', () => {
    expect(getUnresolvedOverrideKey('', [])).toBeNull();
    expect(getUnresolvedOverrideKey(undefined, [])).toBeNull();
    expect(getUnresolvedOverrideKey(null, [])).toBeNull();
  });

  it('returns null when the value resolves against the scoped models', () => {
    expect(
      getUnresolvedOverrideKey(modelId, [
        { id: modelId, key: 'deepseek/deepseek-v4-flash-0731' },
      ]),
    ).toBeNull();
  });

  it('returns the raw value when it does not resolve, instead of clearing it', () => {
    expect(
      getUnresolvedOverrideKey('stale-cuid-no-longer-in-catalog', [
        { id: modelId, key: 'deepseek/deepseek-v4-flash-0731' },
      ]),
    ).toBe('stale-cuid-no-longer-in-catalog');
  });
});

describe('resolveEnabledModelsForCategory', () => {
  it('scopes catalog rows to the allowlist and the selector categories', () => {
    const models = [
      {
        category: ModelCategory.TEXT,
        id: 'text-id',
        key: 'deepseek/deepseek-v4-flash-0731',
        label: 'DeepSeek V4 Flash',
      },
      {
        category: ModelCategory.IMAGE,
        id: 'image-id',
        key: 'google/nano-banana-2',
        label: 'Nano Banana 2 Lite',
      },
    ];

    expect(
      resolveEnabledModelsForCategory(
        ['text-id', 'image-id'],
        models,
        AGENT_THINKING_MODEL_CATEGORIES,
      ),
    ).toEqual([models[0]]);
    expect(
      resolveEnabledModelsForCategory(
        ['text-id', 'image-id'],
        models,
        AGENT_GENERATION_MODEL_CATEGORIES,
      ),
    ).toEqual([models[1]]);
  });

  it('returns no models when the org has not enabled any', () => {
    expect(
      resolveEnabledModelsForCategory(
        [],
        [
          {
            category: ModelCategory.TEXT,
            id: modelId,
            key: 'deepseek/deepseek-v4-flash-0731',
            label: 'DeepSeek V4 Flash',
          },
        ],
        AGENT_THINKING_MODEL_CATEGORIES,
      ),
    ).toEqual([]);
  });
});
