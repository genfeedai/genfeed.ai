import { Platform, PostStatus } from '@genfeedai/enums';
import * as PostsHelper from '@helpers/content/posts.helper';
import { describe, expect, it } from 'vitest';

describe('PostsHelper', () => {
  it('should normalize platform values correctly', () => {
    expect(PostsHelper.normalizePostsPlatform('youtube')).toBe('youtube');
    expect(PostsHelper.normalizePostsPlatform('invalid')).toBe('all');
    expect(PostsHelper.normalizePostsPlatform(Platform.YOUTUBE)).toBe(
      Platform.YOUTUBE,
    );
    expect(
      PostsHelper.normalizePostsPlatform(Platform.GOOGLE_SEARCH_CONSOLE),
    ).toBe('all');
    expect(PostsHelper.POST_PLATFORM_VALUES).not.toContain(
      Platform.GOOGLE_SEARCH_CONSOLE,
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
    expect(PostsHelper.normalizePublisherPostsStatus(PostStatus.FAILED)).toBe(
      PostStatus.FAILED,
    );
    expect(PostsHelper.normalizePublisherPostsStatus(PostStatus.PENDING)).toBe(
      PostStatus.PENDING,
    );
    expect(
      PostsHelper.normalizePublisherPostsStatus(PostStatus.PROCESSING),
    ).toBe(PostStatus.PROCESSING);
    expect(PostsHelper.normalizePublisherPostsStatus('invalid')).toBe('draft');
    expect(PostsHelper.normalizePublisherPostsStatus(undefined)).toBe('draft');
  });

  it('should build canonical publisher post hrefs', () => {
    // No status → Posts library. Draft/scheduled → Drafts pipeline list.
    expect(PostsHelper.getPublisherPostsHref()).toBe('/publish/posts');
    expect(
      PostsHelper.getPublisherPostsHref({ platform: 'all', status: 'draft' }),
    ).toBe('/publish/scheduled');
    expect(PostsHelper.getPublisherPostsHref({ status: 'scheduled' })).toBe(
      '/publish/scheduled',
    );
    expect(
      PostsHelper.getPublisherPostsHref({
        platform: Platform.YOUTUBE,
        status: 'public',
      }),
    ).toBe('/publish/published?platform=youtube');
    expect(
      PostsHelper.getPublisherPostsHref({ status: PostStatus.FAILED }),
    ).toBe('/publish/failed');
    expect(
      PostsHelper.getPublisherPostsHref({ status: PostStatus.PENDING }),
    ).toBe('/publish/pending');
    expect(
      PostsHelper.getPublisherPostsHref({ status: PostStatus.PROCESSING }),
    ).toBe('/publish/processing');
    expect(PostsHelper.getPublisherPostHref('post-1')).toBe(
      '/publish/posts/post-1',
    );
  });

  it('should infer publisher status from canonical post paths', () => {
    expect(
      PostsHelper.getPublisherPostsStatusFromPathname('/publish/scheduled'),
    ).toBe('scheduled');
    expect(
      PostsHelper.getPublisherPostsStatusFromPathname(
        '/acme/brand/publish/published?platform=youtube',
      ),
    ).toBe('public');
    expect(
      PostsHelper.getPublisherPostsStatusFromPathname('/publish'),
    ).toBeNull();
    expect(
      PostsHelper.getPublisherPostsStatusFromPathname('/publish/posts'),
    ).toBeNull();
    expect(
      PostsHelper.getPublisherPostsStatusFromPathname('/publish/failed'),
    ).toBe(PostStatus.FAILED);
    expect(
      PostsHelper.getPublisherPostsStatusFromPathname('/publish/pending'),
    ).toBe(PostStatus.PENDING);
    expect(
      PostsHelper.getPublisherPostsStatusFromPathname('/publish/processing'),
    ).toBe(PostStatus.PROCESSING);
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
