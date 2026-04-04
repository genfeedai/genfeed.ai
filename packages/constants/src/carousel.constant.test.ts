import { CredentialPlatform } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import { CAROUSEL_LIMITS } from './carousel.constant';

describe('carousel.constant', () => {
  it('defines Instagram limits (2-10)', () => {
    const ig = CAROUSEL_LIMITS[CredentialPlatform.INSTAGRAM];
    expect(ig).toBeDefined();
    expect(ig!.min).toBe(2);
    expect(ig!.max).toBe(10);
    expect(ig!.name).toBe('Instagram');
  });

  it('defines TikTok limits (2-35)', () => {
    const tt = CAROUSEL_LIMITS[CredentialPlatform.TIKTOK];
    expect(tt).toBeDefined();
    expect(tt!.min).toBe(2);
    expect(tt!.max).toBe(35);
  });

  it('defines Twitter limits (2-4)', () => {
    const tw = CAROUSEL_LIMITS[CredentialPlatform.TWITTER];
    expect(tw).toBeDefined();
    expect(tw!.max).toBe(4);
  });

  it('defines LinkedIn limits (2-9)', () => {
    const li = CAROUSEL_LIMITS[CredentialPlatform.LINKEDIN];
    expect(li).toBeDefined();
    expect(li!.max).toBe(9);
  });
});
