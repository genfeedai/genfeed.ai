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
  pickPrimaryConnection,
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

  it('maps a genuinely connected account onto connected / healthy / attention', () => {
    // These fixtures represent live, identified connections — the point of
    // this block is the health tier, not the identity/connection check.
    expect(
      getPlatformConnectionHealth({
        externalId: 'ext-1',
        isConnected: true,
      }),
    ).toBe('connected');
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
        externalId: 'ext-1',
        isConnected: true,
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
        externalId: 'ext-1',
        isConnected: true,
      }),
    ).toBe('attention');
  });

  it('reads needsReconnect before any health tier — a broken credential is never "connected"', () => {
    // Disconnected but still identified: a lapsed connection.
    expect(
      getPlatformConnectionHealth({ externalId: 'ext-1', isConnected: false }),
    ).toBe('needsReconnect');
    // Still connected but never captured an identity: a legacy broken row.
    expect(
      getPlatformConnectionHealth({ externalId: undefined, isConnected: true }),
    ).toBe('needsReconnect');
    // needsReconnect wins even when health data looks fine.
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
        externalId: 'ext-1',
        isConnected: false,
      }),
    ).toBe('needsReconnect');
  });

  it('prefers a genuinely connected credential when picking the primary connection', () => {
    const lapsed = {
      credentialId: 'lapsed',
      externalId: 'ext-1',
      isConnected: false,
      platform: Platform.INSTAGRAM,
    };
    const connected = {
      credentialId: 'connected',
      externalId: 'ext-2',
      isConnected: true,
      platform: Platform.INSTAGRAM,
    };

    expect(pickPrimaryConnection([lapsed, connected])).toBe(connected);
    // No genuinely connected credential exists — fall back to the first one
    // so the page can still show it as Needs reconnect rather than empty.
    expect(pickPrimaryConnection([lapsed])).toBe(lapsed);
    expect(pickPrimaryConnection([])).toBeUndefined();
  });

  it('only exposes live and replies when those routes exist', () => {
    expect(getPlatformLiveHref(Platform.YOUTUBE)).toBe(
      APP_ROUTES.AUTOMATION.YOUTUBE_CHAT,
    );
    expect(getPlatformLiveHref(Platform.RESTREAM)).toBe(
      APP_ROUTES.AUTOMATION.YOUTUBE_CHAT,
    );
    expect(getPlatformLiveHref(Platform.TWITCH)).toBe(
      APP_ROUTES.AUTOMATION.TWITCH_CHAT,
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
