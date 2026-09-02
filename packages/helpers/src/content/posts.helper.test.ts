import { createPublishingPostsFilterRoute } from '@genfeedai/constants';
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
    // No status → Posts library. Every lifecycle state is a query-param
    // filter on that same route — never a dedicated path.
    expect(PostsHelper.getPublishingPostsHref()).toBe('/publishing/posts');
    expect(
      PostsHelper.getPublishingPostsHref({ platform: 'all', status: 'draft' }),
    ).toBe('/publishing/posts?publicationState=not-posted');
    expect(PostsHelper.getPublishingPostsHref({ status: 'scheduled' })).toBe(
      '/publishing/posts?publicationState=not-posted',
    );
    expect(
      PostsHelper.getPublishingPostsHref({
        platform: Platform.YOUTUBE,
        status: 'public',
      }),
    ).toBe('/publishing/posts?publicationState=posted&platform=youtube');
    expect(
      PostsHelper.getPublishingPostsHref({ status: PostStatus.FAILED }),
    ).toBe('/publishing/posts?status=failed');
    expect(
      PostsHelper.getPublishingPostsHref({ status: PostStatus.PENDING }),
    ).toBe('/publishing/posts?status=pending');
    expect(
      PostsHelper.getPublishingPostsHref({ status: PostStatus.PROCESSING }),
    ).toBe('/publishing/posts?status=processing');
    expect(PostsHelper.getPublishingPostHref('post-1')).toBe(
      '/publishing/posts/post-1',
    );
  });

  describe('getPublishingPostsStatusPath', () => {
    it('maps published/public status onto the posted filter route', () => {
      expect(PostsHelper.getPublishingPostsStatusPath(PostStatus.PUBLIC)).toBe(
        createPublishingPostsFilterRoute({ publicationState: 'posted' }),
      );
    });

    it('maps scheduled and draft statuses onto the not-posted filter route', () => {
      expect(
        PostsHelper.getPublishingPostsStatusPath(PostStatus.SCHEDULED),
      ).toBe(
        createPublishingPostsFilterRoute({ publicationState: 'not-posted' }),
      );
      expect(PostsHelper.getPublishingPostsStatusPath(PostStatus.DRAFT)).toBe(
        createPublishingPostsFilterRoute({ publicationState: 'not-posted' }),
      );
    });

    it('maps failed/pending/processing statuses onto a status filter route', () => {
      expect(PostsHelper.getPublishingPostsStatusPath(PostStatus.FAILED)).toBe(
        createPublishingPostsFilterRoute({ status: PostStatus.FAILED }),
      );
      expect(PostsHelper.getPublishingPostsStatusPath(PostStatus.PENDING)).toBe(
        createPublishingPostsFilterRoute({ status: PostStatus.PENDING }),
      );
      expect(
        PostsHelper.getPublishingPostsStatusPath(PostStatus.PROCESSING),
      ).toBe(
        createPublishingPostsFilterRoute({ status: PostStatus.PROCESSING }),
      );
    });

    it('defaults an unrecognized or missing status to the not-posted filter route', () => {
      expect(PostsHelper.getPublishingPostsStatusPath(null)).toBe(
        createPublishingPostsFilterRoute({ publicationState: 'not-posted' }),
      );
      expect(PostsHelper.getPublishingPostsStatusPath('bogus')).toBe(
        createPublishingPostsFilterRoute({ publicationState: 'not-posted' }),
      );
    });
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
