import { ModelCategory } from '@genfeedai/contracts';
import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import { describe, expect, it } from 'vitest';

import {
  AGENT_GENERATION_MODEL_CATEGORIES,
  AGENT_THINKING_MODEL_CATEGORIES,
  getUnresolvedOverrideKey,
  resolveEnabledModelsForCategory,
  resolveStoredAgentModelKey,
} from './resolve-enabled-model-options';

const modelId = testId('model');

describe('resolveEnabledModelOptions', () => {
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
});

describe('getUnresolvedOverrideKey', () => {
  it('returns null for an empty value', () => {
    expect(getUnresolvedOverrideKey('', [])).toBeNull();
    expect(getUnresolvedOverrideKey(undefined, [])).toBeNull();
    expect(getUnresolvedOverrideKey(null, [])).toBeNull();
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
