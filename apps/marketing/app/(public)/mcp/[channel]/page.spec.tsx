import { describe, expect, it } from 'vitest';
import McpChannelPage, { generateStaticParams } from './page';

describe('/mcp/[channel] route', () => {
  it('generates one page for each supported channel', () => {
    expect(generateStaticParams()).toEqual([
      { channel: 'linkedin' },
      { channel: 'instagram' },
      { channel: 'youtube' },
      { channel: 'x-twitter' },
      { channel: 'tiktok' },
      { channel: 'facebook' },
    ]);
  });

  it('does not render a channel without a page', async () => {
    await expect(
      McpChannelPage({ params: Promise.resolve({ channel: 'pinterest' }) }),
    ).rejects.toThrow();
  });
});
