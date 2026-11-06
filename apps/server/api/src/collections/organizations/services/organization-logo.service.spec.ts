import { OrganizationLogoService } from '@api/collections/organizations/services/organization-logo.service';
import type { MediaUrlService } from '@api/services/media-urls/media-url.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

type LogoAsset = { cloudObjectKey: string; id: string; parentOrgId: string };

// What reaches Sentry and the logs: the observable side of a signing failure.
const reported = vi.hoisted(() => ({
  exceptions: [] as { context: unknown; error: unknown }[],
  warnings: [] as string[],
}));

vi.mock('@sentry/nestjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nestjs')>()),
  captureException: (error: unknown, context: unknown) => {
    reported.exceptions.push({ context, error });
  },
  captureMessage: () => undefined,
}));

const UNSIGNABLE_KEY = 'logos/bad';

/**
 * Fake asset table (newest first, as the service orders it) and signer. The
 * signer refuses `logos/bad`; `queries` counts asset reads.
 */
function createService(assets: LogoAsset[] = []) {
  const state = { queries: 0 };
  const prisma = {
    asset: {
      findMany: async () => {
        state.queries += 1;
        return assets;
      },
    },
  };
  const mediaUrlService = {
    buildUrl: (key: string) => {
      if (key === UNSIGNABLE_KEY) {
        throw new Error('Could not sign the media URL');
      }
      return `https://cdn.test/${key}?Signature=sig`;
    },
  };
  const loggerService = {
    warn: (message: string) => {
      reported.warnings.push(message);
    },
  };
  return {
    service: new OrganizationLogoService(
      prisma as unknown as PrismaService,
      mediaUrlService as unknown as MediaUrlService,
      loggerService as unknown as LoggerService,
    ),
    state,
  };
}

describe('OrganizationLogoService', () => {
  beforeEach(() => {
    reported.exceptions = [];
    reported.warnings = [];
  });

  it('returns an empty map without querying when no ids are given', async () => {
    const { service, state } = createService();

    const result = await service.resolveLogoUrls(['', '']);

    expect(result.size).toBe(0);
    expect(state.queries).toBe(0);
  });

  it('signs the stored object key through MediaUrlService', async () => {
    const { service } = createService([
      { cloudObjectKey: 'logos/abc.png', id: 'a1', parentOrgId: 'org_1' },
    ]);

    const result = await service.resolveLogoUrls(['org_1']);

    expect(result.get('org_1')).toBe(
      'https://cdn.test/logos/abc.png?Signature=sig',
    );
  });

  it('falls back to the legacy logos/<assetId> key when none is stored', async () => {
    const { service } = createService([
      { cloudObjectKey: '  ', id: 'a2', parentOrgId: 'org_2' },
    ]);

    const result = await service.resolveLogoUrls(['org_2']);

    expect(result.get('org_2')).toBe('https://cdn.test/logos/a2?Signature=sig');
  });

  it('keeps only the newest logo per organization', async () => {
    const { service } = createService([
      { cloudObjectKey: 'logos/new', id: 'new', parentOrgId: 'org_1' },
      { cloudObjectKey: 'logos/old', id: 'old', parentOrgId: 'org_1' },
    ]);

    const result = await service.resolveLogoUrls(['org_1']);

    expect([...result.entries()]).toEqual([
      ['org_1', 'https://cdn.test/logos/new?Signature=sig'],
    ]);
  });

  it('omits an org whose logo cannot be signed and reports once per process', async () => {
    const { service } = createService([
      { cloudObjectKey: UNSIGNABLE_KEY, id: 'bad', parentOrgId: 'org_1' },
      { cloudObjectKey: 'logos/ok', id: 'ok', parentOrgId: 'org_2' },
    ]);

    const first = await service.resolveLogoUrls(['org_1', 'org_2']);
    await service.resolveLogoUrls(['org_1', 'org_2']);

    expect(first.has('org_1')).toBe(false);
    expect(first.get('org_2')).toBe('https://cdn.test/logos/ok?Signature=sig');
    expect(reported.exceptions).toEqual([
      {
        context: expect.objectContaining({
          tags: expect.objectContaining({
            component: 'OrganizationLogoService',
            organizationId: 'org_1',
          }),
        }),
        error: expect.any(Error),
      },
    ]);
    expect(reported.warnings).toHaveLength(1);
  });

  it('falls through to an older logo when the newest cannot be signed', async () => {
    const { service } = createService([
      { cloudObjectKey: UNSIGNABLE_KEY, id: 'bad', parentOrgId: 'org_1' },
      { cloudObjectKey: 'logos/old', id: 'old', parentOrgId: 'org_1' },
    ]);

    const result = await service.resolveLogoUrls(['org_1']);

    expect(result.get('org_1')).toBe(
      'https://cdn.test/logos/old?Signature=sig',
    );
  });
});
