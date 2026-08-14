import { Platform } from '@genfeedai/enums';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getCurrentPlatform,
  getPlatformName,
  platforms,
} from '../src/platforms/config';

function stubLocation(href: string): void {
  const url = new URL(href);
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      href: url.href,
      hostname: url.hostname,
      pathname: url.pathname,
      search: url.search,
    },
  });
}

describe('extension platform config', () => {
  afterEach(() => {
    stubLocation('https://example.com/');
  });

  it('detects Twitter/X from hostname and extracts a status id', () => {
    stubLocation('https://x.com/acme/status/1234567890');

    expect(getCurrentPlatform()?.platform).toBe(Platform.TWITTER);
    expect(getPlatformName()).toBe(Platform.TWITTER);
    expect(platforms.twitter.extractPostId()).toBe('1234567890');
    expect(platforms.twitter.constructPostUrl('1234567890')).toContain(
      '1234567890',
    );
  });

  it('detects YouTube and Facebook post ids from the URL', () => {
    stubLocation('https://www.youtube.com/watch?v=abcdefghijk');
    expect(getCurrentPlatform()?.platform).toBe(Platform.YOUTUBE);

    stubLocation('https://www.facebook.com/posts/post-99');
    expect(platforms.facebook.extractPostId()).toBe('post-99');
    expect(platforms.facebook.constructPostUrl('post-99')).toBe(
      'https://facebook.com/posts/post-99',
    );
  });

  it('detects TikTok video ids from the pathname', () => {
    stubLocation('https://www.tiktok.com/@acme/video/9876543210');

    expect(getCurrentPlatform()?.platform).toBe(Platform.TIKTOK);
    expect(platforms.tiktok.extractPostId()).toBe('9876543210');
  });

  it('returns unknown when the hostname is not a supported platform', () => {
    stubLocation('https://example.com/not-social');

    expect(getCurrentPlatform()).toBeNull();
    expect(getPlatformName()).toBe('unknown');
  });
});
