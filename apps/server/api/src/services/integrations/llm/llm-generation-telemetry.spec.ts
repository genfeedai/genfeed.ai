import type { ILlmCompletionTelemetryEvent } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { buildLlmGenerationTelemetryProperties } from './llm-generation-telemetry';

const SECRET_PROMPT = 'SECRET_PROMPT_SHOULD_NEVER_LEAVE';
const SECRET_COMPLETION = 'SECRET_COMPLETION_SHOULD_NEVER_LEAVE';

const event: ILlmCompletionTelemetryEvent = {
  completionTokens: 5,
  isByok: false,
  latencyMs: 42,
  model: 'deepseek/deepseek-v4-flash-0731',
  organizationId: 'org-1',
  promptTokens: 10,
  provider: 'openrouter',
  runId: 'run-1',
  threadId: 'thread-1',
  userId: 'user-1',
};

describe('buildLlmGenerationTelemetryProperties', () => {
  it('emits allowlisted token, cost, and identity fields', () => {
    const properties = buildLlmGenerationTelemetryProperties(event, {
      inputCostUsd: 0.00009,
      outputCostUsd: 0.00009,
      vendorCostMicros: 180,
    });

    expect(properties).toEqual({
      $ai_input_cost_usd: 0.00009,
      $ai_input_tokens: 10,
      $ai_latency: 42,
      $ai_model: 'deepseek/deepseek-v4-flash-0731',
      $ai_output_cost_usd: 0.00009,
      $ai_output_tokens: 5,
      $ai_provider: 'openrouter',
      $ai_total_cost_usd: 0.00018,
      is_byok: false,
      organization_id: 'org-1',
      run_id: 'run-1',
      thread_id: 'thread-1',
      vendor_cost_micros: 180,
    });
  });

  it('never includes prompt or completion content even when secrets sit on the event object', () => {
    const dirtyEvent = {
      ...event,
      completion: SECRET_COMPLETION,
      content: SECRET_COMPLETION,
      messages: [{ content: SECRET_PROMPT, role: 'user' }],
      prompt: SECRET_PROMPT,
    } as ILlmCompletionTelemetryEvent;

    const properties = buildLlmGenerationTelemetryProperties(dirtyEvent, {
      inputCostUsd: 0,
      outputCostUsd: 0,
      vendorCostMicros: 0,
    });
    const serialized = JSON.stringify(properties);

    expect(serialized).not.toContain(SECRET_PROMPT);
    expect(serialized).not.toContain(SECRET_COMPLETION);
    expect(serialized).not.toContain('messages');
    expect(Object.hasOwn(properties, 'prompt')).toBe(false);
    expect(Object.hasOwn(properties, 'completion')).toBe(false);
    expect(Object.hasOwn(properties, 'content')).toBe(false);
    expect(Object.hasOwn(properties, '$ai_input')).toBe(false);
    expect(Object.hasOwn(properties, '$ai_output_choices')).toBe(false);
  });
});
