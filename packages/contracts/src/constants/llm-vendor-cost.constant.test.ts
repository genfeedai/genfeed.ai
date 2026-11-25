import { describe, expect, it } from 'vitest';
import { AGENT_CHAT_MODEL_KEYS } from './agent-chat-models.constant';
import {
  computeLlmCompletionCostUsd,
  computeLlmPromptCostUsd,
  computeLlmVendorCostMicros,
  LLM_VENDOR_COST_MICROS_PER_USD,
  llmVendorCostMicrosToUsd,
} from './llm-vendor-cost.constant';

describe('computeLlmVendorCostMicros', () => {
  it('converts catalogue list prices into micro-USD', () => {
    // DeepSeek: $0.15/M prompt + $0.60/M completion
    // 1_000 prompt + 500 completion → 150 + 300 = 450 micros
    expect(
      computeLlmVendorCostMicros({
        completionTokens: 500,
        isByok: false,
        model: AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_1_FLASH,
        promptTokens: 1_000,
      }),
    ).toBe(450);
  });

  it('returns 0 for BYOK even when the model has a list price', () => {
    expect(
      computeLlmVendorCostMicros({
        completionTokens: 500,
        isByok: true,
        model: AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_1_FLASH,
        promptTokens: 1_000,
      }),
    ).toBe(0);
  });

  it('returns 0 for unknown models', () => {
    expect(
      computeLlmVendorCostMicros({
        completionTokens: 500,
        isByok: false,
        model: 'unknown/not-in-catalogue',
        promptTokens: 1_000,
      }),
    ).toBe(0);
  });
});

describe('llmVendorCostMicrosToUsd', () => {
  it('divides micro-USD by 1e6', () => {
    expect(llmVendorCostMicrosToUsd(180)).toBe(
      180 / LLM_VENDOR_COST_MICROS_PER_USD,
    );
  });
});

describe('token USD splits', () => {
  it('splits prompt and completion USD independently', () => {
    const input = {
      completionTokens: 500,
      isByok: false,
      model: AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_1_FLASH,
      promptTokens: 1_000,
    };

    expect(computeLlmPromptCostUsd(input)).toBeCloseTo(0.00015, 8);
    expect(computeLlmCompletionCostUsd(input)).toBeCloseTo(0.0003, 8);
  });
});
