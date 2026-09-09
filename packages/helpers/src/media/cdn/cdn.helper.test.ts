import { describe, expect, it } from 'vitest';
import { CDN_BASE_URL, cdnAsset, cdnProductStill } from './cdn.helper';

describe('cdnAsset', () => {
  it('prefixes a leading-slash path with the CDN base', () => {
    expect(cdnAsset('/assets/cards/default.jpg')).toBe(
      'https://cdn.genfeed.ai/assets/cards/default.jpg',
    );
  });

  it('normalizes a path without a leading slash', () => {
    expect(cdnAsset('assets/logo.png')).toBe(
      'https://cdn.genfeed.ai/assets/logo.png',
    );
  });

  it('builds nested asset URLs', () => {
    expect(
      cdnAsset('/assets/branding/website/home/generated-output-wall.png'),
    ).toBe(
      'https://cdn.genfeed.ai/assets/branding/website/home/generated-output-wall.png',
    );
  });

  it('exposes the canonical base without a trailing slash', () => {
    expect(CDN_BASE_URL).toBe('https://cdn.genfeed.ai');
    expect(CDN_BASE_URL.endsWith('/')).toBe(false);
  });

  it('builds product still URLs for a surface and id', () => {
    expect(cdnProductStill('agents', 'script-writer')).toBe(
      'https://cdn.genfeed.ai/assets/agents/script-writer.webp',
    );
  });
});
