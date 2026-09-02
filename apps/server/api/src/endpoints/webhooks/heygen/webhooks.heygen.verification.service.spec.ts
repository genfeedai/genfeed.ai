import { createHmac } from 'node:crypto';
import { HeygenWebhookVerificationService } from '@api/endpoints/webhooks/heygen/webhooks.heygen.verification.service';
import { CacheService } from '@api/services/cache/cache.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn().mockReturnValue('verification'),
  },
}));

const WEBHOOK_SECRET = 'whsec_heygen_test';

describe('HeygenWebhookVerificationService', () => {
  let service: HeygenWebhookVerificationService;
  let cacheService: { claimOnce: vi.Mock; del: vi.Mock; generateKey: vi.Mock };
  let configService: { get: vi.Mock };
  let loggerService: { error: vi.Mock; log: vi.Mock; warn: vi.Mock };

  const rawBody = Buffer.from(
    JSON.stringify({
      event_data: { callback_id: 'cb_1', video_id: 'vid_1' },
      event_type: 'avatar_video.success',
    }),
  );

  const sign = (body: Buffer, secret = WEBHOOK_SECRET) =>
    createHmac('sha256', secret).update(body).digest('hex');

  const nowSeconds = () => String(Math.floor(Date.now() / 1000));

  beforeEach(async () => {
    cacheService = {
      claimOnce: vi.fn().mockResolvedValue('claimed'),
      del: vi.fn().mockResolvedValue(true),
      generateKey: vi.fn((...parts: string[]) => parts.join(':')),
    };
    configService = { get: vi.fn().mockReturnValue(WEBHOOK_SECRET) };
    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: CacheService, useValue: cacheService },
        { provide: ConfigService, useValue: configService },
        { provide: LoggerService, useValue: loggerService },
        HeygenWebhookVerificationService,
      ],
    }).compile();

    service = module.get<HeygenWebhookVerificationService>(
      HeygenWebhookVerificationService,
    );
  });

  describe('assertSignature', () => {
    it('accepts a body signed with the configured secret', () => {
      expect(() =>
        service.assertSignature(rawBody, sign(rawBody), nowSeconds()),
      ).not.toThrow();
    });

    it('rejects a signature produced with a different secret', () => {
      expect(() =>
        service.assertSignature(
          rawBody,
          sign(rawBody, 'whsec_attacker'),
          nowSeconds(),
        ),
      ).toThrow(UnauthorizedException);
    });

    it('rejects a body altered after signing', () => {
      const signature = sign(rawBody);
      const tampered = Buffer.from(
        JSON.stringify({
          event_data: { callback_id: 'cb_1', video_id: 'attacker_asset' },
          event_type: 'avatar_video.success',
        }),
      );

      expect(() =>
        service.assertSignature(tampered, signature, nowSeconds()),
      ).toThrow(UnauthorizedException);
    });

    it.each([
      ['a truncated signature', 'abc'],
      ['an empty signature', ''],
      ['a missing header', undefined],
      ['a repeated header', ['a', 'b']],
    ])('rejects %s without throwing from the comparison', (_label, header) => {
      // `timingSafeEqual` throws a TypeError on unequal lengths, which would
      // surface as a 500 and tell a prober their guess was the wrong size.
      expect(() =>
        service.assertSignature(rawBody, header, nowSeconds()),
      ).toThrow(UnauthorizedException);
    });

    it('rejects every caller when no secret is configured', () => {
      configService.get.mockReturnValue(undefined);

      expect(() =>
        service.assertSignature(rawBody, sign(rawBody), nowSeconds()),
      ).toThrow(UnauthorizedException);

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('HEYGEN_WEBHOOK_SECRET'),
      );
    });

    it('rejects a correctly signed delivery replayed outside the skew window', () => {
      const stale = String(Math.floor(Date.now() / 1000) - 301);

      expect(() =>
        service.assertSignature(rawBody, sign(rawBody), stale),
      ).toThrow(UnauthorizedException);
    });

    it('accepts a delivery at the edge of the skew window', () => {
      const edge = String(Math.floor(Date.now() / 1000) - 299);

      expect(() =>
        service.assertSignature(rawBody, sign(rawBody), edge),
      ).not.toThrow();
    });

    it.each([
      ['an absent timestamp', undefined],
      ['an unparseable timestamp', 'not-a-number'],
    ])('warns but accepts %s on a valid signature', (_label, timestamp) => {
      expect(() =>
        service.assertSignature(rawBody, sign(rawBody), timestamp),
      ).not.toThrow();

      expect(loggerService.warn).toHaveBeenCalled();
    });
  });

  describe('isReplay', () => {
    it('claims a first-seen delivery and lets it through', async () => {
      await expect(service.isReplay('evt_abc')).resolves.toBe(false);

      expect(cacheService.claimOnce).toHaveBeenCalledWith(
        'webhook:heygen:delivery:evt_abc',
        24 * 60 * 60,
        ['webhook:heygen:delivery'],
      );
    });

    it('suppresses a delivery whose event id was already claimed', async () => {
      cacheService.claimOnce.mockResolvedValue('duplicate');

      await expect(service.isReplay('evt_abc')).resolves.toBe(true);
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('replayed delivery suppressed'),
        { eventId: 'evt_abc' },
      );
    });

    it('fails open when the cache is unreachable', async () => {
      cacheService.claimOnce.mockResolvedValue('unavailable');

      await expect(service.isReplay('evt_abc')).resolves.toBe(false);
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('cache unavailable'),
        { eventId: 'evt_abc' },
      );
    });

    it.each([undefined, null, '', 42])(
      'fails open without a usable event id header (%s)',
      async (eventId) => {
        await expect(service.isReplay(eventId)).resolves.toBe(false);
        expect(cacheService.claimOnce).not.toHaveBeenCalled();
      },
    );
  });

  describe('releaseReplayClaim', () => {
    it('deletes the claim key so a retried delivery can process', async () => {
      await service.releaseReplayClaim('evt_abc');

      expect(cacheService.del).toHaveBeenCalledWith(
        'webhook:heygen:delivery:evt_abc',
      );
    });

    it.each([undefined, null, '', 42])(
      'ignores an unusable event id (%s)',
      async (eventId) => {
        await service.releaseReplayClaim(eventId);

        expect(cacheService.del).not.toHaveBeenCalled();
      },
    );
  });
});
