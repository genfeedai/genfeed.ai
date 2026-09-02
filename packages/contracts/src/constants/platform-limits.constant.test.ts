import { describe, expect, it } from 'vitest';
import { CredentialPlatform } from '..';
import {
  getPlatformPreviewLimit,
  PLATFORM_PREVIEW_LIMITS,
} from './platform-limits.constant';

describe('platform-limits.constant', () => {
  it('defines Instagram at 2200 characters with a 4:5 media aspect', () => {
    const limit = PLATFORM_PREVIEW_LIMITS[CredentialPlatform.INSTAGRAM];
    expect(limit?.captionMaxLength).toBe(2200);
    expect(limit?.mediaAspect).toBe('4:5');
  });

  it('defines X (Twitter) at 280 characters with a 16:9 media aspect', () => {
    const limit = PLATFORM_PREVIEW_LIMITS[CredentialPlatform.TWITTER];
    expect(limit?.captionMaxLength).toBe(280);
    expect(limit?.mediaAspect).toBe('16:9');
  });

  it('defines LinkedIn at 3000 characters with a 1:1 media aspect', () => {
    const limit = PLATFORM_PREVIEW_LIMITS[CredentialPlatform.LINKEDIN];
    expect(limit?.captionMaxLength).toBe(3000);
    expect(limit?.mediaAspect).toBe('1:1');
  });

  it('defines TikTok at 2200 characters with a 9:16 media aspect', () => {
    const limit = PLATFORM_PREVIEW_LIMITS[CredentialPlatform.TIKTOK];
    expect(limit?.captionMaxLength).toBe(2200);
    expect(limit?.mediaAspect).toBe('9:16');
  });

  it('defines YouTube at 5000 characters with a 16:9 media aspect', () => {
    const limit = PLATFORM_PREVIEW_LIMITS[CredentialPlatform.YOUTUBE];
    expect(limit?.captionMaxLength).toBe(5000);
    expect(limit?.mediaAspect).toBe('16:9');
  });

  it('defines Threads at 500 characters with a 1:1 media aspect', () => {
    const limit = PLATFORM_PREVIEW_LIMITS[CredentialPlatform.THREADS];
    expect(limit?.captionMaxLength).toBe(500);
    expect(limit?.mediaAspect).toBe('1:1');
  });

  it('getPlatformPreviewLimit resolves by platform id and is undefined for unknown platforms', () => {
    expect(getPlatformPreviewLimit(CredentialPlatform.TIKTOK)?.name).toBe(
      'TikTok',
    );
    expect(getPlatformPreviewLimit(CredentialPlatform.REDDIT)).toBeUndefined();
  });
});
