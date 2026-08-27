import { RssSourcesService } from '@api/collections/rss-sources/services/rss-sources.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CronRssAutopostService } from '@workers/crons/rss/cron.rss-autopost.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CronRssAutopostService', () => {
  const rssSourcesService = {
    listEnabledForSweep: vi.fn(),
    pollSource: vi.fn(),
  };
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
  };
  let service: CronRssAutopostService;

  beforeEach(() => {
    vi.clearAllMocks();
    rssSourcesService.listEnabledForSweep.mockResolvedValue([
      {
        brandId: 'brand-1',
        id: 'rss-1',
        organizationId: 'org-1',
        userId: 'user-1',
      },
      {
        brandId: null,
        id: 'rss-2',
        organizationId: 'org-2',
        userId: 'user-2',
      },
    ]);
    rssSourcesService.pollSource.mockResolvedValue({});
    service = new CronRssAutopostService(
      logger as unknown as LoggerService,
      rssSourcesService as unknown as RssSourcesService,
    );
  });

  it('polls each enabled source and continues after a failure', async () => {
    rssSourcesService.pollSource
      .mockRejectedValueOnce(new Error('feed down'))
      .mockResolvedValueOnce({});

    await service.pollEnabledSources();

    expect(rssSourcesService.pollSource).toHaveBeenCalledTimes(2);
    expect(rssSourcesService.pollSource).toHaveBeenNthCalledWith(1, 'rss-1', {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(rssSourcesService.pollSource).toHaveBeenNthCalledWith(2, 'rss-2', {
      organizationId: 'org-2',
      userId: 'user-2',
    });
    expect(logger.error).toHaveBeenCalledWith(
      'RSS autopost poll failed for source',
      expect.objectContaining({ sourceId: 'rss-1' }),
    );
  });
});
