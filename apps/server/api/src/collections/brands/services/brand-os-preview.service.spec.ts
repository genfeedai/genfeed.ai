import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandOsPreviewService } from '@api/collections/brands/services/brand-os-preview.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
import {
  BadRequestException,
  GoneException,
  ServiceUnavailableException,
} from '@nestjs/common';

function createRedisHarness() {
  const values = new Map<string, string>();
  const client = {
    eval: vi.fn(
      async (
        _script: string,
        _keyCount: number,
        sourceKey: string,
        destinationKey: string,
      ) => {
        const value = values.get(sourceKey);
        if (!value) {
          return null;
        }
        values.set(destinationKey, value);
        values.delete(sourceKey);
        return value;
      },
    ),
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(
      async (
        key: string,
        value: string,
        _expiryMode: string,
        _ttl: number,
        _setMode: string,
      ) => {
        if (values.has(key)) {
          return null;
        }
        values.set(key, value);
        return 'OK';
      },
    ),
  };

  return { client, values };
}

describe('BrandOsPreviewService', () => {
  const brand = {
    agentConfig: {
      voice: { tone: 'direct' },
    },
    description: 'Current description',
    id: 'brand-1',
    isDeleted: false,
    label: 'Acme',
    organizationId: 'org-1',
  } as unknown as BrandDocument;

  let redisHarness: ReturnType<typeof createRedisHarness>;
  let scraper: {
    scrapeWebsite: ReturnType<typeof vi.fn>;
    validateUrl: ReturnType<typeof vi.fn>;
  };
  let redisService: { getPublisher: ReturnType<typeof vi.fn> };
  let service: BrandOsPreviewService;

  beforeEach(() => {
    redisHarness = createRedisHarness();
    scraper = {
      scrapeWebsite: vi.fn(),
      validateUrl: vi.fn().mockReturnValue({ isValid: true }),
    };
    redisService = {
      getPublisher: vi.fn().mockReturnValue(redisHarness.client),
    };
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
    };

    service = new BrandOsPreviewService(
      scraper as unknown as BrandScraperService,
      redisService as unknown as RedisService,
      logger as unknown as LoggerService,
    );
  });

  it('stores a manual preview under a SHA-256 token key with a bounded expiry', async () => {
    const preview = await service.createPreview({
      guidance: 'Direct, proof-led guidance.',
    });

    expect(preview.previewToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(preview.draft.organizationId).toBeUndefined();
    expect(preview.draft.brandId).toMatch(/^brand-os-preview-/);
    expect(preview.draft.fields.promptGuidelines?.proposedValue).toBe(
      'Direct, proof-led guidance.',
    );

    const [key, _value, expiryMode, ttl, setMode] =
      redisHarness.client.set.mock.calls[0];
    expect(key).toMatch(/^brand-os:preview:[a-f0-9]{64}$/);
    expect(key).not.toContain(preview.previewToken);
    expect(_value).not.toContain(preview.previewToken);
    expect([expiryMode, ttl, setMode]).toEqual(['EX', 1800, 'NX']);
  });

  it('requires exactly one bounded intake source before touching Redis', async () => {
    await expect(service.createPreview({})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.createPreview({
        guidance: 'Manual guidance',
        url: 'https://acme.test',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createPreview({ guidance: 'a'.repeat(12_001) }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(redisHarness.client.set).not.toHaveBeenCalled();
    expect(scraper.scrapeWebsite).not.toHaveBeenCalled();
  });

  it.each([
    'http://127.0.0.1',
    'http://10.0.0.1',
    'http://169.254.169.254/latest/meta-data',
    'http://service.internal',
  ])('rejects private, loopback, metadata, or internal URL %s', async (url) => {
    scraper.validateUrl.mockReturnValue({
      error: 'Local URLs are not allowed',
      isValid: false,
    });

    await expect(service.createPreview({ url })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(scraper.scrapeWebsite).not.toHaveBeenCalled();
    expect(redisHarness.client.set).not.toHaveBeenCalled();
  });

  it.each([
    ['a redirect to a private destination', 'Redirect target rejected'],
    ['a DNS answer containing a private address', 'Unsafe DNS destination'],
  ])('rejects %s without creating a token', async (_label, message) => {
    scraper.scrapeWebsite.mockRejectedValue(new Error(message));

    await expect(
      service.createPreview({ url: 'https://public.example' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(redisHarness.client.set).not.toHaveBeenCalled();
  });

  it('uses the scraper output to build a canonical website draft', async () => {
    scraper.scrapeWebsite.mockResolvedValue({
      companyName: 'Acme',
      description: 'Proof-led operations.',
      scrapedAt: new Date('2026-08-26T10:00:00.000Z'),
      socialLinks: {},
      sourceUrl: 'https://acme.test',
    });

    const preview = await service.createPreview({ url: 'https://acme.test' });

    expect(scraper.scrapeWebsite).toHaveBeenCalledWith('https://acme.test');
    expect(preview.draft.sourceType).toBe('website');
    expect(preview.draft.fields.description?.proposedValue).toBe(
      'Proof-led operations.',
    );
  });

  it('atomically consumes a token once and binds the draft to the tenant brand', async () => {
    const preview = await service.createPreview({
      guidance: 'Use concise claims with evidence.',
    });

    const claimed = await service.claimPreview(
      preview.previewToken,
      'org-1',
      brand,
    );

    expect(claimed.status).toBe('claimed');
    expect(claimed.draft.id).toBe('brand-1');
    expect(claimed.draft.brandId).toBe('brand-1');
    expect(claimed.draft.organizationId).toBe('org-1');
    expect(claimed.draft.fields.description?.currentValue).toBe(
      'Current description',
    );
    expect(claimed.draft.fields.promptGuidelines?.proposedValue).toBe(
      'Use concise claims with evidence.',
    );
    expect(redisHarness.client.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('DEL', KEYS[1])"),
      2,
      expect.stringMatching(/^brand-os:preview:[a-f0-9]{64}$/),
      expect.stringMatching(/^brand-os:claimed:[a-f0-9]{64}$/),
      '3600',
    );

    await expect(
      service.claimPreview(preview.previewToken, 'org-1', brand),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it('keeps claimed reads isolated by organization and brand', async () => {
    const preview = await service.createPreview({ guidance: 'Be direct.' });
    await service.claimPreview(preview.previewToken, 'org-1', brand);

    await expect(
      service.readClaimedPreview('org-1', brand),
    ).resolves.toMatchObject({
      draft: { brandId: 'brand-1', organizationId: 'org-1' },
      status: 'claimed',
    });
    await expect(
      service.readClaimedPreview('org-2', brand),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.readClaimedPreview('org-1', {
        ...brand,
        id: 'brand-2',
      } as BrandDocument),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('treats Redis outage as recoverable and never falls back to a Brand row', async () => {
    redisService.getPublisher.mockReturnValue(null);

    await expect(
      service.createPreview({ guidance: 'Retry me.' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      service.readClaimedPreview('org-1', brand),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
