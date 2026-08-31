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
    expect(PostsHelper.normalizePublishingPostsStatus('scheduled')).toBe(
      'scheduled',
    );
    expect(PostsHelper.normalizePublishingPostsStatus('public')).toBe('public');
    expect(PostsHelper.normalizePublishingPostsStatus(PostStatus.FAILED)).toBe(
      PostStatus.FAILED,
    );
    expect(PostsHelper.normalizePublishingPostsStatus(PostStatus.PENDING)).toBe(
      PostStatus.PENDING,
    );
    expect(
      PostsHelper.normalizePublishingPostsStatus(PostStatus.PROCESSING),
    ).toBe(PostStatus.PROCESSING);
    expect(PostsHelper.normalizePublishingPostsStatus('invalid')).toBe('draft');
    expect(PostsHelper.normalizePublishingPostsStatus(undefined)).toBe('draft');
  });

  it('should build canonical publisher post hrefs', () => {
    // No status → Posts library. Draft/scheduled → Drafts pipeline list.
    expect(PostsHelper.getPublishingPostsHref()).toBe('/publishing/posts');
    expect(
      PostsHelper.getPublishingPostsHref({ platform: 'all', status: 'draft' }),
    ).toBe('/publishing/scheduled');
    expect(PostsHelper.getPublishingPostsHref({ status: 'scheduled' })).toBe(
      '/publishing/scheduled',
    );
    expect(
      PostsHelper.getPublishingPostsHref({
        platform: Platform.YOUTUBE,
        status: 'public',
      }),
    ).toBe('/publishing/published?platform=youtube');
    expect(
      PostsHelper.getPublishingPostsHref({ status: PostStatus.FAILED }),
    ).toBe('/publishing/failed');
    expect(
      PostsHelper.getPublishingPostsHref({ status: PostStatus.PENDING }),
    ).toBe('/publishing/pending');
    expect(
      PostsHelper.getPublishingPostsHref({ status: PostStatus.PROCESSING }),
    ).toBe('/publishing/processing');
    expect(PostsHelper.getPublishingPostHref('post-1')).toBe(
      '/publishing/posts/post-1',
    );
  });

  it('should infer publisher status from canonical post paths', () => {
    expect(
      PostsHelper.getPublishingPostsStatusFromPathname('/publishing/scheduled'),
    ).toBe('scheduled');
    expect(
      PostsHelper.getPublishingPostsStatusFromPathname(
        '/acme/brand/publishing/published?platform=youtube',
      ),
    ).toBe('public');
    expect(
      PostsHelper.getPublishingPostsStatusFromPathname('/publishing'),
    ).toBeNull();
    expect(
      PostsHelper.getPublishingPostsStatusFromPathname('/publishing/posts'),
    ).toBeNull();
    expect(
      PostsHelper.getPublishingPostsStatusFromPathname('/publishing/failed'),
    ).toBe(PostStatus.FAILED);
    expect(
      PostsHelper.getPublishingPostsStatusFromPathname('/publishing/pending'),
    ).toBe(PostStatus.PENDING);
    expect(
      PostsHelper.getPublishingPostsStatusFromPathname(
        '/publishing/processing',
      ),
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
