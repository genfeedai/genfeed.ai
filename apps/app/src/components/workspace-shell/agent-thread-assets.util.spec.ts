import { describe, expect, it } from 'vitest';
import { collectThreadAssets } from './agent-thread-assets.util';

describe('collectThreadAssets', () => {
  it('collects reply media and the latest asset once each, in order', () => {
    const assets = collectThreadAssets(
      { lastGeneratedAssetUrl: 'https://cdn.example.com/b.mp4' },
      [
        { metadata: undefined, role: 'user' },
        {
          metadata: {
            contentType: 'image',
            mediaUrl: 'https://cdn.example.com/a.png',
          },
          role: 'assistant',
        },
        {
          metadata: { mediaUrl: 'https://cdn.example.com/b.mp4' },
          role: 'assistant',
        },
      ],
    );

    expect(assets).toEqual([
      { kind: 'image', url: 'https://cdn.example.com/a.png' },
      { kind: 'video', url: 'https://cdn.example.com/b.mp4' },
    ]);
  });

  it('ignores media on the operator’s own messages and non-http URLs', () => {
    const assets = collectThreadAssets(
      { lastGeneratedAssetUrl: 'javascript:alert(1)' },
      [
        {
          metadata: { mediaUrl: 'https://cdn.example.com/mine.png' },
          role: 'user',
        },
        {
          metadata: { mediaUrl: 'data:image/png;base64,AAAA' },
          role: 'assistant',
        },
      ],
    );

    expect(assets).toEqual([]);
  });
});
