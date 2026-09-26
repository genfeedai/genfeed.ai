import { describe, expect, it } from 'vitest';
import {
  assertCrossFamily,
  CrossFamilyViolationError,
  resolveModelFamily,
} from './families';

describe('resolveModelFamily', () => {
  it('reads the vendor from the registry key and folds aliases', () => {
    expect(resolveModelFamily('anthropic/claude-sonnet-5')).toBe('anthropic');
    expect(resolveModelFamily('x-ai/grok-4.6')).toBe('xai');
    expect(resolveModelFamily('xai/grok-imagine')).toBe('xai');
    expect(resolveModelFamily('deepseek-ai/janus')).toBe('deepseek');
    expect(resolveModelFamily('deepseek/deepseek-v4-flash-0731')).toBe(
      'deepseek',
    );
    expect(resolveModelFamily('black-forest-labs/flux-schnell')).toBe(
      'black-forest-labs',
    );
  });

  it('resolves self-hosted models by their upstream family', () => {
    expect(resolveModelFamily('local/qwen-32b')).toBe('qwen');
    expect(resolveModelFamily('local/mistral-small')).toBe('mistral');
    expect(resolveModelFamily('local/unknown-model')).toBeNull();
  });

  it('refuses to guess a family for routers and aggregators', () => {
    expect(resolveModelFamily('openrouter/auto')).toBeNull();
    expect(resolveModelFamily('fal-ai/flux-pro')).toBeNull();
    expect(resolveModelFamily('replicate/some-model')).toBeNull();
    expect(resolveModelFamily('no-slash')).toBeNull();
  });
});

describe('assertCrossFamily', () => {
  it('accepts a judge from a different family', () => {
    expect(() =>
      assertCrossFamily({
        generatorRegistryKeys: [
          'google/gemini-2.5-flash-lite',
          'openai/gpt-5.6-luna',
        ],
        judgeRegistryKeys: ['anthropic/claude-sonnet-5'],
      }),
    ).not.toThrow();
  });

  it('rejects a judge that shares a generator family', () => {
    expect(() =>
      assertCrossFamily({
        generatorRegistryKeys: ['google/gemini-2.5-flash-lite'],
        judgeRegistryKeys: ['google/gemini-3.6-flash'],
      }),
    ).toThrow(CrossFamilyViolationError);
  });

  it('rejects an unresolvable judge or generator', () => {
    expect(() =>
      assertCrossFamily({
        generatorRegistryKeys: ['openrouter/auto'],
        judgeRegistryKeys: ['anthropic/claude-sonnet-5'],
      }),
    ).toThrow(CrossFamilyViolationError);
  });
});
