import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import { InstagramAnalyticsService } from '@api/services/integrations/instagram/services/instagram-analytics.service';
import { TiktokAnalyticsService } from '@api/services/integrations/tiktok/services/tiktok-analytics.service';
import type { InstagramCredentialResponse } from '@genfeedai/contracts/interfaces/integrations/instagram.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import type { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('real resource structure precedes provider observation authority', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(['instagram', 'tiktok'])(
    'does not turn an empty successful transport into a %s observation',
    async (platform) => {
      vi.spyOn(EncryptionUtil, 'decrypt').mockReturnValue('token');
      const credential = { accessToken: 'encrypted' } as CredentialDocument;
      const instagramCredential = {
        accessToken: 'encrypted',
      } as InstagramCredentialResponse;
      const http = { get: vi.fn() },
        logger = { error: vi.fn(), log: vi.fn() };
      const service =
        platform === 'instagram'
          ? new InstagramAnalyticsService(
              http as unknown as HttpService,
              logger as unknown as LoggerService,
              'https://provider.invalid',
              'v1',
              async () => instagramCredential,
            )
          : new TiktokAnalyticsService(
              http as unknown as HttpService,
              logger as unknown as LoggerService,
              'https://provider.invalid',
              async () => credential,
              async () => false,
            );
      for (const data of [{}, { data: { videos: [] } }]) {
        http.get.mockReturnValue(of({ data }));
        await expect(
          service.getMediaAnalytics('org', 'brand', 'remote', 'credential'),
        ).rejects.toThrow('malformed_provider_response');
      }
      http.get.mockReturnValue(
        of({
          data:
            platform === 'instagram'
              ? { id: 'remote' }
              : { data: { videos: [{ id: 'remote' }] } },
        }),
      );
      const result = await service.getMediaAnalytics(
        'org',
        'brand',
        'remote',
        'credential',
      );
      expect(result.learningMetrics?.collection?.outcome).toBe('observed');
      expect(
        Object.values(result.learningMetrics?.metrics ?? {}).some(
          (metric) => metric?.availability === 'observed',
        ),
      ).toBe(false);
    },
  );
});
