import { Platform } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createPublishingPostsFilterRoute,
} from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import {
  buildPlatformHomeDestinations,
  createPlatformHomeRoute,
  filterConnectionsForPlatform,
  getPlatformConnectionHealth,
  getPlatformLiveHref,
  getPlatformRepliesHref,
  isSamePlatform,
} from './platform-home.helpers';

describe('platform-home helpers', () => {
  it('matches credential platforms including aliases', () => {
    expect(isSamePlatform('instagram', Platform.INSTAGRAM)).toBe(true);
    expect(isSamePlatform('INSTAGRAM', Platform.INSTAGRAM)).toBe(true);
    expect(isSamePlatform('x', Platform.TWITTER)).toBe(true);
    expect(isSamePlatform('youtube', Platform.INSTAGRAM)).toBe(false);
  });

  it('filters brand connections to the requested platform', () => {
    const connections = [
      { credentialId: 'ig', platform: Platform.INSTAGRAM },
      { credentialId: 'yt', platform: Platform.YOUTUBE },
    ];

    expect(
      filterConnectionsForPlatform(connections, Platform.INSTAGRAM),
    ).toEqual([connections[0]]);
  });

  it('maps account health onto connected / healthy / attention', () => {
    expect(getPlatformConnectionHealth({})).toBe('connected');
    expect(
      getPlatformConnectionHealth({
        accountHealth: {
          credentialId: '1',
          holdPublishing: false,
          label: 'ok',
          override: { isActive: false },
          platform: Platform.INSTAGRAM,
          riskLevel: 'low',
          score: 80,
          signals: {
            connectedDays: 10,
            profileSignals: 1,
            publishedPosts: 2,
            recentFailures: 0,
          },
          state: 'healthy',
          thresholds: {
            maxRecentFailures: 3,
            minConnectedDays: 1,
            minProfileSignals: 1,
            minPublishedPosts: 1,
          },
        },
      }),
    ).toBe('healthy');
    expect(
      getPlatformConnectionHealth({
        accountHealth: {
          credentialId: '1',
          holdPublishing: true,
          label: 'risk',
          override: { isActive: false },
          platform: Platform.INSTAGRAM,
          riskLevel: 'high',
          score: 10,
          signals: {
            connectedDays: 1,
            profileSignals: 0,
            publishedPosts: 0,
            recentFailures: 4,
          },
          state: 'risky',
          thresholds: {
            maxRecentFailures: 3,
            minConnectedDays: 1,
            minProfileSignals: 1,
            minPublishedPosts: 1,
          },
        },
      }),
    ).toBe('attention');
  });

  it('only exposes live and replies when those routes exist', () => {
    expect(getPlatformLiveHref(Platform.YOUTUBE)).toBe(
      `${APP_ROUTES.AUTOMATION.LIBRARY}/youtube-chat`,
    );
    expect(getPlatformLiveHref(Platform.RESTREAM)).toBe(
      `${APP_ROUTES.AUTOMATION.LIBRARY}/youtube-chat`,
    );
    expect(getPlatformLiveHref(Platform.TWITCH)).toBe(
      `${APP_ROUTES.AUTOMATION.LIBRARY}/twitch-chat`,
    );
    expect(getPlatformLiveHref(Platform.INSTAGRAM)).toBeUndefined();
    expect(getPlatformRepliesHref(Platform.TWITTER)).toBe(
      APP_ROUTES.MESSAGES.REPLIES,
    );
    expect(getPlatformRepliesHref(Platform.YOUTUBE)).toBe(
      APP_ROUTES.MESSAGES.REPLIES,
    );
    expect(getPlatformRepliesHref(Platform.INSTAGRAM)).toBeUndefined();
  });

  it('composes existing product paths with a platform filter', () => {
    const destinations = buildPlatformHomeDestinations(
      Platform.INSTAGRAM,
      'brand-1',
    );

    expect(destinations.settingsSocial).toBe(APP_ROUTES.SETTINGS.SOCIAL);
    expect(destinations.queue).toBe(
      `${createPublishingPostsFilterRoute({ publicationState: 'not-posted' })}&platform=instagram`,
    );
    expect(destinations.posts).toBe(
      `${APP_ROUTES.PUBLISHING.POSTS}?platform=instagram`,
    );
    expect(destinations.messages).toBe(APP_ROUTES.MESSAGES.ROOT);
    expect(destinations.analytics).toBe(
      `${APP_ROUTES.ANALYTICS.BRANDS}/brand-1/platforms/instagram`,
    );
    expect(destinations.create).toContain(APP_ROUTES.AGENT.NEW);
    expect(destinations.live).toBeUndefined();
    expect(createPlatformHomeRoute(Platform.INSTAGRAM)).toBe(
      '/platforms/instagram',
    );
  });
});
