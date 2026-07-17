import { describe, expect, it } from 'vitest';
import {
  sanitizeAgentRunCollectionForSerialization,
  sanitizeAgentRunForSerialization,
} from './agent-run.helper';

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

  it('preserves absent fields and normalizes malformed structured values', () => {
    expect(sanitizeAgentRunForSerialization({ id: 'run-1' })).toEqual({
      id: 'run-1',
    });

    expect(
      sanitizeAgentRunForSerialization({
        id: 'run-2',
        label: 42,
        metadata: 'invalid',
        steps: { id: 'not-an-array' },
        toolCalls: null,
      }),
    ).toEqual({
      id: 'run-2',
      label: 42,
      metadata: {},
      steps: [],
      toolCalls: [],
    });
  });

  it('bounds public text fields and sanitizes each collection item', () => {
    const collection = sanitizeAgentRunCollectionForSerialization({
      docs: [
        {
          id: 'run-1',
          label: 'l'.repeat(300),
          objective: 'o'.repeat(1_100),
          summary: 's'.repeat(2_100),
        },
        {
          id: 'run-2',
          metadata: {
            agentScope: 'invalid',
            source: 'agent',
          },
        },
      ],
      total: 2,
    });

    expect(collection.total).toBe(2);
    expect(collection.docs[0]?.label).toHaveLength(240);
    expect(collection.docs[0]?.objective).toHaveLength(1_000);
    expect(collection.docs[0]?.summary).toHaveLength(2_000);
    expect(collection.docs[1]?.metadata).toEqual({
      agentScope: {},
      source: 'agent',
    });
  });
});
