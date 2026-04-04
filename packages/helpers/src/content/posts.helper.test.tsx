import { Platform } from '@genfeedai/enums';
import * as PostsHelper from '@helpers/content/posts.helper';
import { describe, expect, it } from 'vitest';

describe('PostsHelper', () => {
  it('should normalize platform values correctly', () => {
    expect(PostsHelper.normalizePostsPlatform('youtube')).toBe('youtube');
    expect(PostsHelper.normalizePostsPlatform('invalid')).toBe('all');
    expect(PostsHelper.normalizePostsPlatform(Platform.YOUTUBE)).toBe(
      Platform.YOUTUBE,
    );
  });

  it('should get platform labels correctly', () => {
    expect(PostsHelper.getPostsPlatformLabel('all')).toBe('All');
    expect(PostsHelper.getPostsPlatformLabel(Platform.YOUTUBE)).toBe('YouTube');
  });

  it('should get post status options', () => {
    const options = PostsHelper.getPostStatusOptions();
    expect(Array.isArray(options)).toBe(true);
    expect(options.length).toBeGreaterThan(0);
  });

  it('should normalize publisher post status values', () => {
    expect(PostsHelper.normalizePublisherPostsStatus('scheduled')).toBe(
      'scheduled',
    );
    expect(PostsHelper.normalizePublisherPostsStatus('public')).toBe('public');
    expect(PostsHelper.normalizePublisherPostsStatus('invalid')).toBe('draft');
    expect(PostsHelper.normalizePublisherPostsStatus(undefined)).toBe('draft');
  });

  it('should build canonical publisher post hrefs', () => {
    expect(PostsHelper.getPublisherPostsHref()).toBe('/content/posts');
    expect(
      PostsHelper.getPublisherPostsHref({ platform: 'all', status: 'draft' }),
    ).toBe('/content/posts');
    expect(PostsHelper.getPublisherPostsHref({ status: 'scheduled' })).toBe(
      '/content/posts?status=scheduled',
    );
    expect(
      PostsHelper.getPublisherPostsHref({
        platform: Platform.YOUTUBE,
        status: 'public',
      }),
    ).toBe('/content/posts?status=public&platform=youtube');
  });

  it('should get post platform tabs', () => {
    const tabs = PostsHelper.getPostPlatformTabs();
    expect(Array.isArray(tabs)).toBe(true);
    expect(tabs.length).toBeGreaterThan(0);
  });

  it('should use distinct icons for Facebook and Instagram tabs', () => {
    const tabs = PostsHelper.getPostPlatformTabs([
      Platform.FACEBOOK,
      Platform.INSTAGRAM,
    ]);

    const facebookTab = tabs.find((tab) => tab.id === Platform.FACEBOOK);
    const instagramTab = tabs.find((tab) => tab.id === Platform.INSTAGRAM);

    expect(facebookTab?.icon).toBeDefined();
    expect(instagramTab?.icon).toBeDefined();
    expect(facebookTab?.icon).not.toBe(instagramTab?.icon);
  });
});
