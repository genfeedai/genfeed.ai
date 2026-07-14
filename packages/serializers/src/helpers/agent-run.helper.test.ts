import { describe, expect, it } from 'vitest';
import { sanitizeAgentRunForSerialization } from './agent-run.helper';

describe('sanitizeAgentRunForSerialization', () => {
  it('keeps operator provenance while removing provider payloads and secrets', () => {
    const sanitized = sanitizeAgentRunForSerialization({
      error: 'Request failed with Bearer sk-private',
      id: 'run-1',
      label: 'Operator run',
      metadata: {
        actualModel: 'openai/gpt-5',
        agentScope: {
          brandId: 'brand-1',
          contextVersion: 4,
          organizationId: 'org-1',
          password: 'private',
          threadId: 'thread-1',
        },
        apiKey: 'private',
        rawProviderResponse: { token: 'private' },
        routingPolicy: 'quality',
      },
      objective: 'Create a campaign',
      steps: [
        {
          id: 'step-1',
          label: 'Research',
          metadata: { apiKey: 'private' },
          status: 'COMPLETED',
        },
      ],
      toolCalls: [
        {
          parameters: { apiKey: 'private' },
          result: { raw: 'private' },
          status: 'completed',
          toolName: 'web_search',
        },
      ],
    });

    expect(sanitized.metadata).toEqual({
      actualModel: 'openai/gpt-5',
      agentScope: {
        brandId: 'brand-1',
        contextVersion: 4,
        organizationId: 'org-1',
        threadId: 'thread-1',
      },
      routingPolicy: 'quality',
    });
    expect(sanitized.steps).toEqual([
      { id: 'step-1', label: 'Research', status: 'COMPLETED' },
    ]);
    expect(sanitized.toolCalls).toEqual([
      { status: 'completed', toolName: 'web_search' },
    ]);
    expect(sanitized.error).toBe('Request failed with Bearer [REDACTED]');
  });
});
