import { assertMcpAccessModeAllowsTool } from './mcp-access-mode.util';

describe('restricted OAuth agent execution', () => {
  it.each([
    'generate',
    'execute_workflow',
    'generate_content_batch',
    'send_chat_message',
    'resolve_approval',
  ])('rejects %s on both execution surfaces', (name) => {
    for (const surface of ['agent', 'mcp'] as const) {
      expect(() =>
        assertMcpAccessModeAllowsTool(
          { mcpAccessMode: 'claude' },
          name,
          surface,
        ),
      ).toThrow('This operation is unavailable');
    }
  });
  it('allows safe drafts and onboarding operations while preserving standard clients', () => {
    expect(() =>
      assertMcpAccessModeAllowsTool(
        { mcpAccessMode: 'claude' },
        'create_post',
        'agent',
      ),
    ).not.toThrow();
    expect(() =>
      assertMcpAccessModeAllowsTool(
        { mcpAccessMode: 'claude' },
        'scan_brand_url',
        'agent',
      ),
    ).not.toThrow();
    expect(() =>
      assertMcpAccessModeAllowsTool({}, 'generate', 'agent'),
    ).not.toThrow();
  });
});
