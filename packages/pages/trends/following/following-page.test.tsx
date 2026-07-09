import { describe, expect, it } from 'vitest';
import FollowingPage, { getSafeExternalUrl } from './following-page';

describe('FollowingPage', () => {
  it('exports the Research Following page component', () => {
    expect(FollowingPage).toBeDefined();
  });

  it('allows only HTTP(S) source links', () => {
    expect(getSafeExternalUrl('https://x.com/openai/status/1')).toBe(
      'https://x.com/openai/status/1',
    );
    expect(getSafeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(getSafeExternalUrl('data:text/html,unsafe')).toBeNull();
    expect(getSafeExternalUrl('not a URL')).toBeNull();
  });
});
