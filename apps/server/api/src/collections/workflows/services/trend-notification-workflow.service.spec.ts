import { TrendNotificationWorkflowService } from '@api/collections/workflows/services/trend-notification-workflow.service';
import { ParseMode } from '@genfeedai/enums';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('TrendNotificationWorkflowService', () => {
  const prisma = {
    organization: { findFirst: vi.fn() },
    setting: { findFirst: vi.fn() },
  };
  const trendsService = {
    getTrendingHashtags: vi.fn(),
    getTrendingSounds: vi.fn(),
    getViralVideos: vi.fn(),
  };
  const cacheService = { acquireLock: vi.fn() };
  const notificationsService = {
    sendEmail: vi.fn(),
    sendNotification: vi.fn(),
    sendTelegramMessage: vi.fn(),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const configService = { get: vi.fn() };

  let service: TrendNotificationWorkflowService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T09:15:00.000Z'));
    vi.clearAllMocks();

    prisma.organization.findFirst.mockResolvedValue({
      user: { email: 'owner@example.com' },
      userId: 'user-1',
    });
    prisma.setting.findFirst.mockResolvedValue({
      isTrendNotificationsEmail: true,
      isTrendNotificationsInApp: true,
      isTrendNotificationsTelegram: true,
      trendNotificationsEmailAddress: 'notify@example.com',
      trendNotificationsFrequency: 'HOURLY',
      trendNotificationsMinViralScore: 70,
      trendNotificationsTelegramChatId: 'chat-1',
      userId: 'user-1',
    });
    trendsService.getViralVideos.mockResolvedValue([
      {
        platform: 'tiktok',
        title: 'Fast video',
        url: 'https://example.com/video',
        viralScore: 91,
        views: 1000000,
      },
    ]);
    trendsService.getTrendingHashtags.mockResolvedValue([
      {
        hashtag: 'above',
        platform: 'tiktok',
        postCount: 500000,
        viralityScore: 88,
      },
      {
        hashtag: 'below',
        platform: 'tiktok',
        postCount: 500,
        viralityScore: 20,
      },
    ]);
    trendsService.getTrendingSounds.mockResolvedValue([
      {
        playUrl: 'https://example.com/sound',
        soundName: 'Viral sound',
        usageCount: 50000,
        viralityScore: 80,
      },
    ]);
    cacheService.acquireLock.mockResolvedValue(true);
    notificationsService.sendEmail.mockResolvedValue(undefined);
    notificationsService.sendNotification.mockResolvedValue(undefined);
    notificationsService.sendTelegramMessage.mockResolvedValue(undefined);
    configService.get.mockReturnValue('https://app.genfeed.ai');

    service = new TrendNotificationWorkflowService(
      prisma as never,
      trendsService as never,
      cacheService as never,
      notificationsService as never,
      logger as never,
      configService as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends configured channels for the owner setting matching the cadence', async () => {
    const result = await service.runTrendSummaryNotifications(
      'org-1',
      'hourly',
    );

    expect(prisma.organization.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'org-1', isDeleted: false },
      }),
    );
    expect(prisma.setting.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          trendNotificationsFrequency: 'HOURLY',
          userId: 'user-1',
        }),
      }),
    );
    expect(cacheService.acquireLock).toHaveBeenCalledWith(
      expect.stringContaining('workflow-trend-summary:org-1:hourly:user-1'),
      7200,
    );
    expect(notificationsService.sendTelegramMessage).toHaveBeenCalledWith(
      'chat-1',
      expect.stringContaining('#above'),
      { parse_mode: ParseMode.MARKDOWN },
    );
    expect(
      notificationsService.sendTelegramMessage.mock.calls[0][1],
    ).not.toContain('#below');
    expect(notificationsService.sendEmail).toHaveBeenCalledWith(
      'notify@example.com',
      expect.stringContaining('Trend Summary'),
      expect.stringContaining('<!DOCTYPE html>'),
    );
    expect(notificationsService.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'trend_summary',
        userId: 'user-1',
      }),
    );
    expect(result).toMatchObject({
      action: 'trendSummaryNotifications',
      cadence: 'hourly',
      errors: 0,
      organizationId: 'org-1',
      sent: 3,
      status: 'completed',
      trends: 3,
    });
  });

  it('skips when the owner has no settings for the cadence', async () => {
    prisma.setting.findFirst.mockResolvedValue(null);

    const result = await service.runTrendSummaryNotifications(
      'org-1',
      'weekly',
    );

    expect(cacheService.acquireLock).not.toHaveBeenCalled();
    expect(notificationsService.sendEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      cadence: 'weekly',
      reason: 'settings_missing',
      status: 'skipped',
    });
  });

  it('skips duplicate cadence windows by org, cadence, recipient set, and window', async () => {
    cacheService.acquireLock.mockResolvedValue(false);

    const result = await service.runTrendSummaryNotifications('org-1', 'daily');

    expect(notificationsService.sendEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      cadence: 'daily',
      reason: 'notification_window_already_sent',
      status: 'skipped',
    });
  });

  it('skips without sending when no trends match threshold', async () => {
    trendsService.getViralVideos.mockResolvedValue([]);
    trendsService.getTrendingHashtags.mockResolvedValue([]);
    trendsService.getTrendingSounds.mockResolvedValue([]);

    const result = await service.runTrendSummaryNotifications(
      'org-1',
      'hourly',
    );

    expect(cacheService.acquireLock).not.toHaveBeenCalled();
    expect(notificationsService.sendEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      reason: 'no_trends',
      status: 'skipped',
    });
  });

  it('reports delivery errors and continues other channels', async () => {
    notificationsService.sendEmail.mockRejectedValueOnce(
      new Error('email failed'),
    );

    const result = await service.runTrendSummaryNotifications(
      'org-1',
      'hourly',
    );

    expect(notificationsService.sendTelegramMessage).toHaveBeenCalled();
    expect(notificationsService.sendNotification).toHaveBeenCalled();
    expect(result).toMatchObject({
      errors: 1,
      sent: 2,
      status: 'completed',
    });
  });
});
