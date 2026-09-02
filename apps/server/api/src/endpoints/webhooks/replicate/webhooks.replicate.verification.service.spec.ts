import { ReplicateWebhookVerificationService } from '@api/endpoints/webhooks/replicate/webhooks.replicate.verification.service';
import { CacheService } from '@api/services/cache/cache.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { ConfigService } from '@libs/config/config.service';
import type { ReplicateWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn().mockReturnValue('verification'),
  },
}));

describe('ReplicateWebhookVerificationService', () => {
  let service: ReplicateWebhookVerificationService;
  let cacheService: { claimOnce: vi.Mock; generateKey: vi.Mock };
  let configService: { get: vi.Mock };
  let loggerService: { error: vi.Mock; log: vi.Mock; warn: vi.Mock };
  let replicateService: { getPrediction: vi.Mock };

  const signedPayload = {
    id: 'pred_123',
    output: ['https://evil.example.com/forged.png'],
    status: 'succeeded',
    version: 'ver_forged',
  } as unknown as ReplicateWebhookPayload;

  beforeEach(async () => {
    cacheService = {
      claimOnce: vi.fn().mockResolvedValue('claimed'),
      generateKey: vi.fn((...parts: string[]) => parts.join(':')),
    };
    configService = { get: vi.fn().mockReturnValue('r8_test_key') };
    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    replicateService = { getPrediction: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: CacheService, useValue: cacheService },
        { provide: ConfigService, useValue: configService },
        { provide: LoggerService, useValue: loggerService },
        { provide: ReplicateService, useValue: replicateService },
        ReplicateWebhookVerificationService,
      ],
    }).compile();

    service = module.get<ReplicateWebhookVerificationService>(
      ReplicateWebhookVerificationService,
    );
  });

  describe('isReplay', () => {
    it('claims a first-seen delivery and lets it through', async () => {
      await expect(service.isReplay('msg_abc')).resolves.toBe(false);

      expect(cacheService.claimOnce).toHaveBeenCalledWith(
        'webhook:replicate:delivery:msg_abc',
        24 * 60 * 60,
        ['webhook:replicate:delivery'],
      );
    });

    it('suppresses a delivery whose id was already claimed', async () => {
      cacheService.claimOnce.mockResolvedValue('duplicate');

      await expect(service.isReplay('msg_abc')).resolves.toBe(true);
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('replayed delivery suppressed'),
        { webhookId: 'msg_abc' },
      );
    });

    it('fails open when the cache is unreachable', async () => {
      cacheService.claimOnce.mockResolvedValue('unavailable');

      await expect(service.isReplay('msg_abc')).resolves.toBe(false);
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('cache unavailable'),
        { webhookId: 'msg_abc' },
      );
    });

    it.each([undefined, null, '', 42])(
      'fails open without a usable webhook-id header (%s)',
      async (webhookId) => {
        await expect(service.isReplay(webhookId)).resolves.toBe(false);
        expect(cacheService.claimOnce).not.toHaveBeenCalled();
      },
    );
  });

  describe('resolveTrustedPayload', () => {
    it('replaces status and output with the record held by Replicate', async () => {
      replicateService.getPrediction.mockResolvedValue({
        error: null,
        id: 'pred_123',
        output: ['https://replicate.delivery/pbxt/real.png'],
        status: 'succeeded',
        version: 'ver_real',
      });

      const resolved = await service.resolveTrustedPayload(signedPayload);

      expect(replicateService.getPrediction).toHaveBeenCalledWith('pred_123');
      expect(resolved?.output).toEqual([
        'https://replicate.delivery/pbxt/real.png',
      ]);
      expect(resolved?.version).toBe('ver_real');
    });

    it('overrides a forged success with the real failed status', async () => {
      replicateService.getPrediction.mockResolvedValue({
        error: 'NSFW content detected',
        id: 'pred_123',
        output: null,
        status: 'failed',
      });

      const resolved = await service.resolveTrustedPayload(signedPayload);

      expect(resolved?.status).toBe('failed');
      expect(resolved?.output).toBeNull();
      expect(resolved?.error).toBe('NSFW content detected');
    });

    it('rejects the signed payload when no API key is configured', async () => {
      configService.get.mockReturnValue(undefined);

      const resolved = await service.resolveTrustedPayload(signedPayload);

      expect(replicateService.getPrediction).not.toHaveBeenCalled();
      expect(resolved).toBeNull();
    });

    it('rejects the signed payload when the re-fetch throws', async () => {
      replicateService.getPrediction.mockRejectedValue(new Error('404'));

      const resolved = await service.resolveTrustedPayload(signedPayload);

      expect(resolved).toBeNull();
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('prediction re-fetch failed'),
        expect.objectContaining({ predictionId: 'pred_123' }),
      );
    });

    it.each([
      ['a mismatched id', { id: 'pred_other', status: 'succeeded' }],
      ['a record with no id', { status: 'succeeded' }],
      ['a non-object response', 'succeeded'],
      ['null', null],
    ])('rejects the signed payload on %s', async (_label, prediction) => {
      replicateService.getPrediction.mockResolvedValue(prediction);

      const resolved = await service.resolveTrustedPayload(signedPayload);

      expect(resolved).toBeNull();
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('mismatched record'),
        { predictionId: 'pred_123' },
      );
    });

    it('rejects a matching record without a trusted status', async () => {
      replicateService.getPrediction.mockResolvedValue({
        id: 'pred_123',
        output: ['https://replicate.delivery/pbxt/real.png'],
      });

      await expect(
        service.resolveTrustedPayload(signedPayload),
      ).resolves.toBeNull();
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('invalid status'),
        { predictionId: 'pred_123' },
      );
    });
  });

  describe('deferUntrustedDelivery', () => {
    it('registers an untrusted prediction under the reconciliation cache tag', async () => {
      await service.deferUntrustedDelivery(signedPayload);

      expect(cacheService.claimOnce).toHaveBeenCalledWith(
        'webhook:replicate:untrusted:pred_123',
        24 * 60 * 60,
        ['webhook:replicate:untrusted'],
      );
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('deferred for reconciliation'),
        { predictionId: 'pred_123' },
      );
    });
  });
});
