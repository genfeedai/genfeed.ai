import { CronExternalVoiceCatalogService } from '@workers/crons/external-voice-catalog/cron.external-voice-catalog.service';
import { describe, expect, it, vi } from 'vitest';

describe('CronExternalVoiceCatalogService', () => {
  it('delegates to ExternalVoiceCatalogService.syncFromProviders', async () => {
    const externalVoiceCatalog = {
      syncFromProviders: vi.fn().mockResolvedValue({ created: 2, updated: 5 }),
    };
    const logger = { log: vi.fn() };
    const service = new CronExternalVoiceCatalogService(
      externalVoiceCatalog as never,
      logger as never,
    );

    await service.syncFromProviders();

    expect(externalVoiceCatalog.syncFromProviders).toHaveBeenCalledOnce();
    expect(logger.log).toHaveBeenCalledWith(
      'External voice catalog synced (created=2, updated=5)',
      'CronExternalVoiceCatalogService',
    );
  });
});
