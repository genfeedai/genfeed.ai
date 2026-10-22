import { withMcpStructuredContent } from '@mcp/services/mcp-structured-result.util';
import type { CallToolResultSchema } from '@modelcontextprotocol/core';
import { describe, expect, it } from 'vitest';

type McpCallResult = ReturnType<typeof CallToolResultSchema.parse>;

const envelopes = [
  { data: { profile: { organizationName: 'Acme' } }, creditsDebited: 0 },
  { data: [{ id: 'draft-1' }], genfeedCards: { cards: [] } },
  {
    code: 'approval_pending',
    message: 'Review this action.',
    approvalId: 'approval-1',
  },
  { failure: { reason: 'ACCESS_DENIED', detail: null } },
  {
    artifact: { id: 'image-1', renderMode: 'native_image' },
    data: { status: 'GENERATED' },
  },
  { tool: { name: 'get_account' } },
  { tools: [] },
  { toolsets: [] },
  { domainSpecificField: { nested: [1, null, true] } },
];

describe('withMcpStructuredContent', () => {
  it.each(envelopes)(
    'preserves an existing domain envelope %#',
    (structuredContent) => {
      const result = {
        content: [{ type: 'text', text: 'Readable result' }],
        structuredContent,
      } satisfies McpCallResult;
      expect(withMcpStructuredContent(result)).toBe(result);
    },
  );

  it('adds only returned text while preserving every native block and metadata', () => {
    const result = {
      _meta: { ui: { resourceUri: 'ui://cards' } },
      content: [
        { type: 'text', text: 'Image ready.' },
        { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' },
        { type: 'audio', data: 'YXVkaW8=', mimeType: 'audio/wav' },
        {
          type: 'resource_link',
          uri: 'https://cdn.example/image.png',
          name: 'Image',
        },
        {
          type: 'resource',
          resource: { uri: 'content://source', text: 'Resource body' },
        },
        { type: 'text', text: 'Saved in Library.' },
      ],
    } satisfies McpCallResult;
    const before = structuredClone(result);
    const normalized = withMcpStructuredContent(result);
    expect(normalized).toEqual({
      ...before,
      structuredContent: { message: 'Image ready.\nSaved in Library.' },
    });
    expect(normalized.content).toBe(result.content);
    expect(normalized._meta).toBe(result._meta);
    expect(result).toEqual(before);
  });

  it('preserves sanitized errors without recreating omitted resource data', () => {
    const result = {
      content: [
        {
          type: 'text',
          text: 'tool result withheld: suspected instruction injection',
        },
      ],
      isError: true,
    } satisfies McpCallResult;
    expect(withMcpStructuredContent(result)).toEqual({
      ...result,
      structuredContent: {
        message: 'tool result withheld: suspected instruction injection',
      },
    });
  });

  it('supports a contentless result without inventing success or a domain payload', () => {
    expect(withMcpStructuredContent({ content: [] })).toEqual({
      content: [],
      structuredContent: { message: '' },
    });
  });

  it.each([
    null,
    [],
    'not an object',
    { message: 12 },
    { creditsDebited: '8' },
    { failure: 'not an object' },
    { artifact: [] },
    { tools: {} },
  ])('rejects schema-invalid structured results %#', (structuredContent) => {
    expect(() =>
      withMcpStructuredContent({ content: [], structuredContent }),
    ).toThrow();
  });
});
