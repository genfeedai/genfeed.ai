import { BrandAssetAutofillService } from '@api/collections/brands/services/brand-asset-autofill.service';
import type { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  IBrandKitAssetImportCandidate,
  IBrandKitResolvedAssets,
  IScrapedBrandData,
} from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SCOPE = { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' };

function scraped(overrides: Partial<IScrapedBrandData>): IScrapedBrandData {
  return {
    scrapedAt: new Date('2026-09-23T00:00:00Z'),
    sourceUrl: 'https://acme.com',
    ...overrides,
  };
}

describe('BrandAssetAutofillService', () => {
  let credentialFindMany: ReturnType<typeof vi.fn>;
  let importBrandKitAssets: ReturnType<typeof vi.fn>;
  let resolveBrandKitAssets: ReturnType<typeof vi.fn>;
  let loggerService: { warn: ReturnType<typeof vi.fn> };
  let service: BrandAssetAutofillService;

  function importedCandidates(): IBrandKitAssetImportCandidate[] {
    return importBrandKitAssets.mock.calls[0][3].assets;
  }

  beforeEach(() => {
    credentialFindMany = vi.fn().mockResolvedValue([]);
    importBrandKitAssets = vi
      .fn()
      .mockResolvedValue({ diagnostics: [], results: [] });
    resolveBrandKitAssets = vi
      .fn()
      .mockResolvedValue({ references: [] } satisfies IBrandKitResolvedAssets);
    loggerService = { warn: vi.fn() };

    service = new BrandAssetAutofillService(
      {
        credential: { findMany: credentialFindMany },
      } as unknown as PrismaService,
      { importBrandKitAssets } as unknown as BrandsService,
      { resolveBrandKitAssets } as unknown as BrandKitAssetsService,
      loggerService as unknown as LoggerService,
    );
  });

  describe('fillFromSocialProfile', () => {
    it('imports the avatar as logo and the banner as banner without replacing', async () => {
      await service.fillFromSocialProfile(SCOPE, {
        avatarUrl: 'https://pbs.twimg.com/profile_images/1/avatar_400x400.jpg',
        bannerUrl:
          'https://pbs.twimg.com/profile_banners/1/1700000000/1500x500',
        platform: 'twitter',
      });

      expect(resolveBrandKitAssets).toHaveBeenCalledWith('brand-1', 'org-1');
      expect(importBrandKitAssets).toHaveBeenCalledWith(
        'brand-1',
        'org-1',
        'user-1',
        {
          assets: [
            {
              candidateId: 'autofill:logo:0',
              label: 'twitter profile image',
              mimeType: undefined,
              replaceExisting: false,
              role: 'logo',
              sourceType: 'system',
              sourceUrl:
                'https://pbs.twimg.com/profile_images/1/avatar_400x400.jpg',
            },
            {
              candidateId: 'autofill:banner:0',
              label: 'twitter banner',
              // Extensionless social URLs need a type for the importer.
              mimeType: 'image/jpeg',
              replaceExisting: false,
              role: 'banner',
              sourceType: 'system',
              sourceUrl:
                'https://pbs.twimg.com/profile_banners/1/1700000000/1500x500',
            },
          ],
        },
      );
    });

    it('never touches a slot that already holds an asset', async () => {
      resolveBrandKitAssets.mockResolvedValue({
        logo: { id: 'uploaded-logo', role: 'logo', url: 'https://cdn/logo' },
        references: [],
      });

      await service.fillFromSocialProfile(SCOPE, {
        avatarUrl: 'https://pbs.twimg.com/profile_images/1/avatar.jpg',
        bannerUrl: 'https://pbs.twimg.com/profile_banners/1/1700000000',
        platform: 'twitter',
      });

      expect(importedCandidates().map((candidate) => candidate.role)).toEqual([
        'banner',
      ]);
    });

    it('does nothing when both slots are already filled', async () => {
      resolveBrandKitAssets.mockResolvedValue({
        banner: { id: 'b', role: 'banner', url: 'https://cdn/banner' },
        logo: { id: 'l', role: 'logo', url: 'https://cdn/logo' },
        references: [],
      });

      await service.fillFromSocialProfile(SCOPE, {
        avatarUrl: 'https://pbs.twimg.com/profile_images/1/avatar.jpg',
        platform: 'twitter',
      });

      expect(importBrandKitAssets).not.toHaveBeenCalled();
    });

    it.each([
      'https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png',
      'https://mastodon.social/avatars/original/missing.png',
      'https://www.redditstatic.com/avatars/defaults/v2/avatar_default_3.png',
      'javascript:alert(1)',
    ])(
      'skips provider placeholders and non-web URLs (%s)',
      async (avatarUrl) => {
        await service.fillFromSocialProfile(SCOPE, {
          avatarUrl,
          platform: 'twitter',
        });

        expect(importBrandKitAssets).not.toHaveBeenCalled();
      },
    );

    it('logs and swallows importer failures so the OAuth callback survives', async () => {
      importBrandKitAssets.mockRejectedValue(new Error('files unavailable'));

      await expect(
        service.fillFromSocialProfile(SCOPE, {
          avatarUrl: 'https://pbs.twimg.com/profile_images/1/avatar.jpg',
          platform: 'twitter',
        }),
      ).resolves.toBeUndefined();

      expect(loggerService.warn).toHaveBeenCalledWith(
        'Brand asset autofill failed',
        expect.objectContaining({ brandId: 'brand-1' }),
      );
    });
  });

  describe('fillFromWebsite', () => {
    it('ranks connected-account avatars ahead of the website logo chain', async () => {
      credentialFindMany.mockResolvedValue([
        {
          externalAvatar: 'https://cdn.genfeed.ai/social-avatars/cred-1',
          platform: 'TWITTER',
        },
      ]);

      await service.fillFromWebsite(
        SCOPE,
        scraped({
          logoCandidateUrls: [
            'https://acme.com/logo.svg',
            'https://acme.com/apple-touch-icon.png',
            'https://img.logo.dev/acme.com?token=pk_test&size=128&format=png&fallback=monogram',
          ],
          logoUrl: 'https://acme.com/logo.svg',
        }),
      );

      expect(credentialFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            brandId: 'brand-1',
            externalAvatar: { not: null },
            isConnected: true,
            isDeleted: false,
            organizationId: 'org-1',
          },
        }),
      );
      expect(
        importedCandidates().map(({ mimeType, sourceType, sourceUrl }) => ({
          mimeType,
          sourceType,
          sourceUrl,
        })),
      ).toEqual([
        {
          mimeType: 'image/jpeg',
          sourceType: 'system',
          sourceUrl: 'https://cdn.genfeed.ai/social-avatars/cred-1',
        },
        {
          mimeType: undefined,
          sourceType: 'website',
          sourceUrl: 'https://acme.com/logo.svg',
        },
        {
          mimeType: undefined,
          sourceType: 'website',
          sourceUrl: 'https://acme.com/apple-touch-icon.png',
        },
        {
          mimeType: 'image/png',
          sourceType: 'website',
          sourceUrl:
            'https://img.logo.dev/acme.com?token=pk_test&size=128&format=png&fallback=monogram',
        },
      ]);
    });

    it('uses the hero image, then the typed social card, as banner candidates', async () => {
      await service.fillFromWebsite(
        SCOPE,
        scraped({
          bannerUrl: 'https://acme.com/hero.avif',
          ogImage: 'https://acme.com/opengraph-image?abc123',
          ogImageType: 'image/png',
        }),
      );

      expect(
        importedCandidates()
          .filter(({ role }) => role === 'banner')
          .map(({ mimeType, sourceUrl }) => ({ mimeType, sourceUrl })),
      ).toEqual([
        { mimeType: undefined, sourceUrl: 'https://acme.com/hero.avif' },
        {
          mimeType: 'image/png',
          sourceUrl: 'https://acme.com/opengraph-image?abc123',
        },
      ]);
    });

    it('resolves a relative social card and types a header that is the same card', async () => {
      await service.fillFromWebsite(
        SCOPE,
        scraped({
          bannerUrl: 'https://acme.com/opengraph-image?abc123',
          ogImage: '/opengraph-image?abc123',
          ogImageType: 'image/png',
        }),
      );

      expect(
        importedCandidates().map(({ label, mimeType, sourceUrl }) => ({
          label,
          mimeType,
          sourceUrl,
        })),
      ).toEqual([
        {
          label: 'Website header',
          mimeType: 'image/png',
          sourceUrl: 'https://acme.com/opengraph-image?abc123',
        },
      ]);
    });

    it('falls back to logoUrl when the scrape predates logo candidates', async () => {
      await service.fillFromWebsite(
        SCOPE,
        scraped({ logoUrl: 'https://acme.com/logo.png' }),
      );

      expect(importedCandidates()).toEqual([
        expect.objectContaining({
          role: 'logo',
          sourceUrl: 'https://acme.com/logo.png',
        }),
      ]);
    });

    it('reports the slots no candidate could fill', async () => {
      importBrandKitAssets.mockResolvedValue({
        diagnostics: [{ code: 'brand_kit_asset_unknown_content_type' }],
        results: [{ role: 'logo', status: 'failed' }],
      });

      await service.fillFromWebsite(
        SCOPE,
        scraped({ logoCandidateUrls: ['https://acme.com/favicon.ico'] }),
      );

      expect(loggerService.warn).toHaveBeenCalledWith(
        'Brand asset autofill left slots empty',
        expect.objectContaining({ unfilledRoles: ['logo'] }),
      );
    });
  });
});
