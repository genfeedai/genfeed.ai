import {
  describeMcpApprovalArguments,
  humanizeToken,
  summarizeMcpApproval,
} from '@api/collections/mcp-approvals/utils/mcp-approval-summary.util';

describe('mcp-approval-summary.util', () => {
  it('humanizes snake and camel case tokens', () => {
    expect(humanizeToken('aspect_ratio')).toBe('Aspect ratio');
    expect(humanizeToken('mediaType')).toBe('Media Type');
  });

  it('lists short public settings and drops ids, secrets and content', () => {
    expect(
      describeMcpApprovalArguments({
        apiKey: 'secret',
        brandId: 'brand-1',
        prompt: 'a long caption',
        type: 'image',
        count: 2,
      }),
    ).toBe('Type: image · Count: 2');
  });

  it('names the tool by its title, falling back to the humanized name', () => {
    expect(summarizeMcpApproval('not_a_real_tool', { type: 'image' })).toBe(
      'Not a real tool · Type: image',
    );
    expect(summarizeMcpApproval('not_a_real_tool', {})).toBe('Not a real tool');
  });
});
