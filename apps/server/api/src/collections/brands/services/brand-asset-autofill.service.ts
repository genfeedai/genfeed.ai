import type {
  BrandAssetAutofillCandidate,
  BrandAssetAutofillScope,
  SocialProfileAssets,
} from '@api/collections/brands/interfaces/brand-asset-autofill.interface';
import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { isProviderPlaceholderImageUrl } from '@api/collections/credentials/utils/provider-placeholder-image.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { fromPrismaCredentialPlatform } from '@genfeedai/contracts';
import type {
  BrandKitAssetRole,
  BrandKitSourceType,
  IBrandKitAssetImportCandidate,
  IScrapedBrandData,
  IScrapedImageCandidate,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type AutofillRole = Exclude<BrandKitAssetRole, 'reference'>;
type AutofillImage = Omit<IScrapedImageCandidate, 'url'> & {
  url?: string | null;
};

const AUTOFILL_ROLES: readonly AutofillRole[] = ['logo', 'banner'];
const IMAGE_EXTENSION_PATTERN = /\.(gif|jpe?g|png|webp)$/i;
const SOCIAL_AVATAR_CANDIDATE_LIMIT = 5;

/**
 * Fills a brand's empty logo and banner from what Genfeed already knows about
 * the brand: its connected social accounts first, its website second.
 *
 * Only empty slots are touched. Every candidate goes through the brand-kit
 * importer with `replaceExisting: false`, so an uploaded or previously imported
 * asset is never replaced, and Genfeed stores its own S3 copy. Candidates are
 * tried in order; one the importer rejects (SVG, ICO, unreachable) falls
 * through to the next. Best-effort by design: failures are logged, never
 * thrown, so neither onboarding nor an OAuth callback can fail on them.
 */
@Injectable()
export class BrandAssetAutofillService {
  private readonly context = 'BrandAssetAutofillService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService,
    private readonly brandKitAssetsService: BrandKitAssetsService,
    private readonly loggerService: LoggerService,
  ) {}

  /** Connected-account trigger: the avatar becomes the logo, the header the banner. */
  async fillFromSocialProfile(
    scope: BrandAssetAutofillScope,
    profile: SocialProfileAssets,
  ): Promise<void> {
    await this.fillEmptySlots(scope, {
      banner: this.toSocialCandidates(
        [profile.bannerUrl],
        `${profile.platform} banner`,
      ),
      logo: this.toSocialCandidates(
        [profile.avatarUrl],
        `${profile.platform} profile image`,
      ),
    });
  }

  /**
   * Website trigger. Connected-account avatars still rank ahead of anything
   * scraped, so a brand whose site is scraped after it connected a social
   * account gets the account's avatar, not a favicon.
   */
  async fillFromWebsite(
    scope: BrandAssetAutofillScope,
    scrapedData: IScrapedBrandData,
  ): Promise<void> {
    const socialAvatars = await this.findConnectedAccountAvatars(scope);
    const websiteLogos = scrapedData.logoCandidates?.length
      ? scrapedData.logoCandidates
      : [{ url: scrapedData.logoUrl }];

    await this.fillEmptySlots(scope, {
      banner: this.toWebsiteBannerCandidates(scrapedData),
      logo: [
        ...socialAvatars,
        ...this.toCandidates(
          websiteLogos,
          'Website logo',
          'website',
          scrapedData.sourceUrl,
        ),
      ],
    });
  }

  private async fillEmptySlots(
    scope: BrandAssetAutofillScope,
    candidatesByRole: Record<AutofillRole, BrandAssetAutofillCandidate[]>,
  ): Promise<void> {
    const { brandId, organizationId, userId } = scope;

    try {
      const existing = await this.brandKitAssetsService.resolveBrandKitAssets(
        brandId,
        organizationId,
      );
      const emptyRoles = AUTOFILL_ROLES.filter(
        (role) => !existing[role] && candidatesByRole[role].length > 0,
      );

      if (emptyRoles.length === 0) {
        return;
      }

      // The importer checks each candidate against the slot before uploading,
      // so the first successful import leaves the rest of its role skipped.
      const assets = emptyRoles.flatMap((role) =>
        this.dedupe(candidatesByRole[role]).map(
          (candidate, index): IBrandKitAssetImportCandidate => ({
            candidateId: `autofill:${role}:${index}`,
            label: candidate.label,
            mimeType: candidate.mimeType,
            replaceExisting: false,
            role,
            sourceType: candidate.sourceType,
            sourceUrl: candidate.url,
          }),
        ),
      );

      const result = await this.brandsService.importBrandKitAssets(
        brandId,
        organizationId,
        userId,
        { assets },
      );

      const filledRoles = result.results
        .filter((entry) => entry.status === 'imported')
        .map((entry) => entry.role);
      const unfilledRoles = emptyRoles.filter(
        (role) => !filledRoles.includes(role),
      );

      if (unfilledRoles.length > 0) {
        this.loggerService.warn('Brand asset autofill left slots empty', {
          brandId,
          context: this.context,
          diagnostics: result.diagnostics,
          unfilledRoles,
        });
      }
    } catch (error: unknown) {
      this.loggerService.warn('Brand asset autofill failed', {
        brandId,
        context: this.context,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Genfeed's stored copies of the brand's connected-account avatars, oldest
   * connection first so the brand's original account wins.
   */
  private async findConnectedAccountAvatars(
    scope: BrandAssetAutofillScope,
  ): Promise<BrandAssetAutofillCandidate[]> {
    try {
      const credentials = await this.prisma.credential.findMany({
        orderBy: { createdAt: 'asc' },
        select: { externalAvatar: true, platform: true },
        take: SOCIAL_AVATAR_CANDIDATE_LIMIT,
        where: scopedWhere(scope.organizationId, {
          brandId: scope.brandId,
          externalAvatar: { not: null },
          isConnected: true,
        }),
      });

      return credentials.flatMap((credential) =>
        this.toSocialCandidates(
          [credential.externalAvatar],
          `${fromPrismaCredentialPlatform(credential.platform) ?? String(credential.platform).toLowerCase()} profile image`,
        ),
      );
    } catch (error: unknown) {
      this.loggerService.warn('Could not read connected-account avatars', {
        brandId: scope.brandId,
        context: this.context,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private toSocialCandidates(
    urls: ReadonlyArray<string | null | undefined>,
    label: string,
  ): BrandAssetAutofillCandidate[] {
    // Social CDNs (and Genfeed's avatar copies) serve extensionless JPEGs.
    return this.toCandidates(
      urls.map((url) => ({ mimeType: 'image/jpeg', url })),
      label,
      'system',
    );
  }

  private toWebsiteBannerCandidates(
    scrapedData: IScrapedBrandData,
  ): BrandAssetAutofillCandidate[] {
    const { bannerUrl, ogImage, ogImageType, sourceUrl } = scrapedData;
    // Generated social cards (e.g. `/opengraph-image?…`) have no extension but
    // declare their type in `og:image:type`. The header is often that same
    // card, and dedupe keeps the first entry, so it must carry the type too.
    const isHeaderSocialCard =
      Boolean(ogImage) &&
      this.resolveUrl(bannerUrl, sourceUrl) ===
        this.resolveUrl(ogImage, sourceUrl);

    return [
      ...this.toCandidates(
        [
          {
            mimeType: isHeaderSocialCard ? ogImageType : undefined,
            url: bannerUrl,
          },
        ],
        'Website header',
        'website',
        sourceUrl,
      ),
      ...this.toCandidates(
        [{ mimeType: ogImageType, url: ogImage }],
        'Website social card',
        'website',
        sourceUrl,
      ),
    ];
  }

  /**
   * `baseUrl` resolves page-relative scraped URLs (`og:image` is kept
   * verbatim). A declared type is only sent for extensionless URLs; the
   * importer infers the rest from the extension.
   */
  private toCandidates(
    images: ReadonlyArray<AutofillImage>,
    label: string,
    sourceType: BrandKitSourceType,
    baseUrl?: string,
  ): BrandAssetAutofillCandidate[] {
    return images.flatMap(({ mimeType, url }) => {
      const parsed = this.parseHttpUrl(url, baseUrl);

      if (!parsed || isProviderPlaceholderImageUrl(parsed.href)) {
        return [];
      }

      return [
        {
          label,
          mimeType: IMAGE_EXTENSION_PATTERN.test(parsed.pathname)
            ? undefined
            : mimeType,
          sourceType,
          url: parsed.href,
        },
      ];
    });
  }

  private parseHttpUrl(
    url: string | null | undefined,
    baseUrl?: string,
  ): URL | undefined {
    if (!url) {
      return undefined;
    }

    try {
      const parsed = new URL(url, baseUrl);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  private resolveUrl(
    url: string | null | undefined,
    baseUrl: string,
  ): string | undefined {
    return this.parseHttpUrl(url, baseUrl)?.href;
  }

  private dedupe(
    candidates: BrandAssetAutofillCandidate[],
  ): BrandAssetAutofillCandidate[] {
    const seen = new Set<string>();

    return candidates.filter((candidate) => {
      if (seen.has(candidate.url)) {
        return false;
      }
      seen.add(candidate.url);
      return true;
    });
  }
}
