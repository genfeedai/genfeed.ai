import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

// Opaque placeholder — the CloudFront signer is mocked, so no key material
// belongs in this spec.
const TEST_PRIVATE_KEY = 'test-signing-key-placeholder';

const { getSignedUrl } = vi.hoisted(() => ({ getSignedUrl: vi.fn() }));
vi.mock('@aws-sdk/cloudfront-signer', () => ({ getSignedUrl }));

interface ConfigOverrides {
  cdnSigningKeyPairId?: string;
  cdnSigningPrivateKey?: string;
  cdnSignedUrlTtlSeconds?: number;
}

async function buildService(overrides: ConfigOverrides = {}) {
  const keyPairId = overrides.cdnSigningKeyPairId;
  const privateKey = overrides.cdnSigningPrivateKey;
  const config = {
    cdnSignedUrlTtlSeconds: overrides.cdnSignedUrlTtlSeconds ?? 900,
    cdnSigningKeyPairId: keyPairId,
    cdnSigningPrivateKey: privateKey,
    cdnUrl: 'https://cdn.genfeed.ai',
    isCdnSigningEnabled: Boolean(keyPairId && privateKey),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const module = await Test.createTestingModule({
    providers: [
      MediaUrlService,
      { provide: ConfigService, useValue: config },
      { provide: LoggerService, useValue: logger },
    ],
  }).compile();

  return { logger, service: module.get(MediaUrlService) };
}

describe('MediaUrlService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSignedUrl.mockReturnValue('https://cdn.genfeed.ai/signed?Signature=abc');
  });

  describe('without signing configured', () => {
    it('builds an unsigned absolute URL from the object key', async () => {
      const { service } = await buildService();
      expect(service.buildUrl('ingredients/images/abc')).toBe(
        'https://cdn.genfeed.ai/ingredients/images/abc',
      );
      expect(getSignedUrl).not.toHaveBeenCalled();
    });

    it('does not sign when only the key-pair id is set', async () => {
      const { service } = await buildService({
        cdnSigningKeyPairId: 'KEYPAIR',
      });
      expect(service.buildUrl('ingredients/images/abc')).toBe(
        'https://cdn.genfeed.ai/ingredients/images/abc',
      );
      expect(getSignedUrl).not.toHaveBeenCalled();
    });

    it('strips leading slashes so the key never doubles the separator', async () => {
      const { service } = await buildService();
      expect(service.buildUrl('///ingredients/images/abc')).toBe(
        'https://cdn.genfeed.ai/ingredients/images/abc',
      );
    });

    it('rejects an empty object key', async () => {
      const { service } = await buildService();
      expect(() => service.buildUrl('   ')).toThrow(/objectKey is required/);
    });
  });

  describe('with signing configured', () => {
    const signingConfig = {
      cdnSigningKeyPairId: 'KEYPAIR',
      cdnSigningPrivateKey: TEST_PRIVATE_KEY,
    };

    it('signs the URL with the configured key pair', async () => {
      const { service } = await buildService(signingConfig);
      const url = service.buildUrl('ingredients/images/abc');

      expect(url).toBe('https://cdn.genfeed.ai/signed?Signature=abc');
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          keyPairId: 'KEYPAIR',
          privateKey: TEST_PRIVATE_KEY,
          url: 'https://cdn.genfeed.ai/ingredients/images/abc',
        }),
      );
    });

    it('expires the signature after the configured TTL', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-21T00:00:00.000Z'));

      const { service } = await buildService({
        ...signingConfig,
        cdnSignedUrlTtlSeconds: 300,
      });
      service.buildUrl('ingredients/images/abc');

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          dateLessThan: '2026-09-21T00:05:00.000Z',
        }),
      );
      vi.useRealTimers();
    });

    it('leaves public-by-design media unsigned', async () => {
      const { service } = await buildService(signingConfig);

      expect(
        service.buildUrl('assets/agents/script-writer.webp', {
          isSignable: false,
        }),
      ).toBe('https://cdn.genfeed.ai/assets/agents/script-writer.webp');
      expect(getSignedUrl).not.toHaveBeenCalled();
    });

    it('throws rather than falling back to an unsigned URL when signing fails', async () => {
      getSignedUrl.mockImplementation(() => {
        throw new Error('bad key');
      });
      const { logger, service } = await buildService(signingConfig);

      expect(() => service.buildUrl('ingredients/images/abc')).toThrow(
        /Could not sign the media URL/,
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
