import {
  describeMcpApprovalAction,
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

  it('names the media type of a generation and drops it from the settings', () => {
    expect(
      describeMcpApprovalAction('generate', {
        aspectRatio: '16:9',
        brandId: 'brand-1',
        type: 'Video',
      }),
    ).toEqual({ details: 'Aspect Ratio: 16:9', title: 'Generate video' });
  });

  it('keeps the settings of a tool that has no media type', () => {
    expect(
      describeMcpApprovalAction('create_brand_from_url', {
        label: 'Vitae',
        url: 'https://vitae.ai',
      }),
    ).toEqual({
      details: 'Label: Vitae · Url: https://vitae.ai',
      title: 'Create Brand From Url',
    });
  });
});
