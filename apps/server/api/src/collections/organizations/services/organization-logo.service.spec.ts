import { OrganizationLogoService } from '@api/collections/organizations/services/organization-logo.service';
import type { MediaUrlService } from '@api/services/media-urls/media-url.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import * as Sentry from '@sentry/nestjs';

vi.mock('@sentry/nestjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

describe('OrganizationLogoService', () => {
  const prisma = { asset: { findMany: vi.fn() } };
  const mediaUrlService = { buildUrl: vi.fn() };
  const loggerService = { warn: vi.fn() };

  const createService = () =>
    new OrganizationLogoService(
      prisma as unknown as PrismaService,
      mediaUrlService as unknown as MediaUrlService,
      loggerService as unknown as LoggerService,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    mediaUrlService.buildUrl.mockImplementation(
      (key: string) => `https://cdn.test/${key}?Signature=sig`,
    );
  });

  it('returns an empty map without querying when no ids are given', async () => {
    const result = await createService().resolveLogoUrls(['', '']);

    expect(result.size).toBe(0);
    expect(prisma.asset.findMany).not.toHaveBeenCalled();
  });

  it('signs the stored object key through MediaUrlService', async () => {
    prisma.asset.findMany.mockResolvedValue([
      { cloudObjectKey: 'logos/abc.png', id: 'a1', parentOrgId: 'org_1' },
    ]);

    const result = await createService().resolveLogoUrls(['org_1']);

    expect(mediaUrlService.buildUrl).toHaveBeenCalledWith('logos/abc.png');
    expect(result.get('org_1')).toBe(
      'https://cdn.test/logos/abc.png?Signature=sig',
    );
  });

  it('falls back to the legacy logos/<assetId> key when none is stored', async () => {
    prisma.asset.findMany.mockResolvedValue([
      { cloudObjectKey: '  ', id: 'a2', parentOrgId: 'org_2' },
    ]);

    await createService().resolveLogoUrls(['org_2']);

    expect(mediaUrlService.buildUrl).toHaveBeenCalledWith('logos/a2');
  });

  it('keeps only the newest logo per organization', async () => {
    prisma.asset.findMany.mockResolvedValue([
      { cloudObjectKey: 'logos/new', id: 'new', parentOrgId: 'org_1' },
      { cloudObjectKey: 'logos/old', id: 'old', parentOrgId: 'org_1' },
    ]);

    const result = await createService().resolveLogoUrls(['org_1']);

    expect(mediaUrlService.buildUrl).toHaveBeenCalledTimes(1);
    expect(result.get('org_1')).toContain('logos/new');
  });

  it('omits an org whose logo cannot be signed and reports once per process', async () => {
    prisma.asset.findMany.mockResolvedValue([
      { cloudObjectKey: 'logos/bad', id: 'bad', parentOrgId: 'org_1' },
      { cloudObjectKey: 'logos/ok', id: 'ok', parentOrgId: 'org_2' },
    ]);
    mediaUrlService.buildUrl.mockImplementation((key: string) => {
      if (key === 'logos/bad') {
        throw new Error('Could not sign the media URL');
      }
      return `https://cdn.test/${key}`;
    });
    const service = createService();

    const first = await service.resolveLogoUrls(['org_1', 'org_2']);
    await service.resolveLogoUrls(['org_1', 'org_2']);

    expect(first.has('org_1')).toBe(false);
    expect(first.get('org_2')).toBe('https://cdn.test/logos/ok');
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({
          component: 'OrganizationLogoService',
          organizationId: 'org_1',
        }),
      }),
    );
    expect(loggerService.warn).toHaveBeenCalledTimes(1);
  });

  it('falls through to an older logo when the newest cannot be signed', async () => {
    prisma.asset.findMany.mockResolvedValue([
      { cloudObjectKey: 'logos/bad', id: 'bad', parentOrgId: 'org_1' },
      { cloudObjectKey: 'logos/old', id: 'old', parentOrgId: 'org_1' },
    ]);
    mediaUrlService.buildUrl.mockImplementation((key: string) => {
      if (key === 'logos/bad') {
        throw new Error('Could not sign the media URL');
      }
      return `https://cdn.test/${key}`;
    });

    const result = await createService().resolveLogoUrls(['org_1']);

    expect(result.get('org_1')).toBe('https://cdn.test/logos/old');
  });
});
