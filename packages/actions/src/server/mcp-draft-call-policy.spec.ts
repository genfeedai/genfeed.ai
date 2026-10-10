import { describe, expect, it } from 'vitest';
import { isMcpTextDraftCall } from './mcp-draft-call-policy';

describe('bounded MCP text draft', () => {
  it('recognizes the actual standalone content branch', () => {
    expect(isMcpTextDraftCall({ content: 'A draft', brandId: 'brand' })).toBe(
      true,
    );
  });
  it.each([
    {},
    { content: ' ' },
    { caption: 'Caption only' },
    { textContent: 'Wrong field' },
    { content: 'Draft', contentId: 'existing' },
    { content: 'Draft', ingredientId: 'existing' },
    { content: 'Draft', confirmed: true },
    { content: 'Draft', scheduledAt: '2030-01-01' },
    { content: 'Draft', targets: [{ scheduledDate: '2030-01-01' }] },
    { content: 'Draft', release: {} },
    { content: 'Draft', status: 'scheduled' },
    { content: 'Draft', sourceActionId: 'publish' },
    { content: 'Draft', unknown: true },
  ])('retains approval for unbounded or non-draft arguments: %j', (args) => {
    expect(isMcpTextDraftCall(args)).toBe(false);
  });
});
