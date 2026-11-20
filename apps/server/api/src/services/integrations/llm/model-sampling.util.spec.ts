import {
  buildOpenAiSamplingParams,
  modelAcceptsTemperature,
} from '@api/services/integrations/llm/model-sampling.util';

describe('modelAcceptsTemperature', () => {
  it.each([
    ['anthropic/claude-sonnet-5.5', false],
    ['anthropic/claude-opus-5.5', false],
    ['openai/gpt-6.1-terra', false],
    ['openai/gpt-6-luna', false],
    ['openai/gpt-5.6-terra', false],
    ['openai/o3-mini', false],
    ['google/gemini-4-neon', true],
    ['x-ai/grok-4.7', true],
    ['moonshotai/kimi-k3.1-pro', true],
    ['deepseek/deepseek-v4.1-flash-1017', true],
    ['openai/gpt-image-2.5-flare', true],
  ])('%s -> %s', (model, expected) => {
    expect(modelAcceptsTemperature(model)).toBe(expected);
  });
});

describe('buildOpenAiSamplingParams', () => {
  const input = { max_tokens: 800, temperature: 0.7 };

  it.each([
    ['gpt-6.1-terra', { max_completion_tokens: 800 }],
    ['gpt-6-luna', { max_completion_tokens: 800 }],
    ['gpt-5.6-terra', { max_completion_tokens: 800 }],
    ['o3-mini', {}],
    ['o4-mini', {}],
    ['qwen-32b', { max_tokens: 800, temperature: 0.7 }],
    ['gpt-4.1', { max_tokens: 800, temperature: 0.7 }],
  ])('%s', (model, expected) => {
    expect(buildOpenAiSamplingParams(model, input)).toEqual(expected);
  });

  it('sends nothing the caller did not set', () => {
    expect(buildOpenAiSamplingParams('gpt-6-luna', {})).toEqual({});
    expect(buildOpenAiSamplingParams('qwen-32b', {})).toEqual({});
  });
});
