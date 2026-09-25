import { ModelCategory } from '@genfeedai/contracts';
import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import { describe, expect, it } from 'vitest';

import {
  AGENT_GENERATION_MODEL_CATEGORIES,
  AGENT_THINKING_MODEL_CATEGORIES,
  resolveEnabledModelOptions,
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
        ['cmsn4dijv00400cmnf77l1gzt'],
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
});
