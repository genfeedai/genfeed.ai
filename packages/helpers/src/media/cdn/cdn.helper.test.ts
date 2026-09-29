import { describe, expect, it } from 'vitest';
import { CDN_BASE_URL, cdnAsset, cdnProductStill } from './cdn.helper';

describe('cdnAsset', () => {
  it('normalizes a path without a leading slash', () => {
    expect(cdnAsset('assets/logo.png')).toBe(
      'https://cdn.genfeed.ai/assets/logo.png',
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
