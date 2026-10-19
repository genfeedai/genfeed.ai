import {
  characterAssetIdsFromRow,
  personaReferencesAnyWhere,
} from '@api/collections/personas/utils/persona-references.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  hasMediaRecordAccess,
  MEDIA_DELIVERY_POLICY_VERSION,
  MEDIA_DELIVERY_SOURCE_SELECT,
  mediaSourceIdentity,
  protectedPreviewCategory,
  requireStoredMediaKey,
} from '@api/services/media-urls/media-delivery-policy.util';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isCloudDeployment } from '@genfeedai/config';
import { PersonaAvailabilityMode, PostVisibility } from '@genfeedai/contracts';
import type {
  MediaAssetProjection,
  MediaDeliveryGrant,
  MediaDeliveryPurpose,
  MediaDeliveryScope,
  MediaDeliverySource,
  MediaResourceProjection,
} from '@genfeedai/contracts/interfaces';
import { hasCleanExportAccess } from '@genfeedai/pricing';
import { ConfigService } from '@libs/config/config.service';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

/** Only record identities cross this boundary; raw URLs/keys are never inputs. */
@Injectable()
export class AuthorizedMediaUrlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly urls: MediaUrlService,
  ) {}

  public get isEnabled(): boolean {
    return isCloudDeployment() && this.config.isAuthorizedMediaDeliveryEnabled;
  }

  async issueOriginal(
    scope: MediaDeliveryScope,
    ingredientId: string,
  ): Promise<MediaDeliveryGrant> {
    const [source] = await this.readSources(scope.organizationId, [
      ingredientId,
    ]);
    this.requireRecordAccess(source, scope);
    if (!(await this.hasCleanAccess(scope.organizationId))) {
      throw new ForbiddenException(
        'A paid plan is required for clean originals',
      );
    }
    return this.grant(
      source.id,
      requireStoredMediaKey(source),
      'original-download',
    );
  }

  async projectIngredients(
    scope: MediaDeliveryScope,
    ingredientIds: readonly string[],
  ): Promise<MediaResourceProjection[]> {
    if (ingredientIds.length === 0) return [];
    const [sources, hasCleanAccess] = await Promise.all([
      this.readSources(scope.organizationId, ingredientIds),
      this.hasCleanAccess(scope.organizationId),
    ]);
    const visible = sources.filter((source) =>
      hasMediaRecordAccess(source, scope),
    );
    const variants = hasCleanAccess
      ? []
      : await this.prisma.mediaDeliveryVariant.findMany({
          where: {
            ingredientId: { in: visible.map((source) => source.id) },
            isDeleted: false,
            organizationId: scope.organizationId,
            policyVersion: MEDIA_DELIVERY_POLICY_VERSION,
            purpose: 'preview',
          },
        });
    return visible.map((source) => {
      let grant: MediaDeliveryGrant;
      if (hasCleanAccess) {
        try {
          grant = this.grant(
            source.id,
            requireStoredMediaKey(source),
            'preview',
          );
        } catch {
          grant = this.unavailable(source.id, 'preview', 'FAILED');
        }
      } else if (!protectedPreviewCategory(source)) {
        grant = this.unavailable(source.id, 'preview', 'UNSUPPORTED');
      } else {
        const variant = variants.find(
          (entry) =>
            entry.ingredientId === source.id &&
            entry.sourceIdentity === mediaSourceIdentity(source),
        );
        grant =
          variant?.state === 'READY' &&
          variant.storageKey?.startsWith('exports/watermarked/') &&
          variant.storageKey !== source.s3Key
            ? this.grant(source.id, variant.storageKey, 'preview')
            : this.unavailable(
                source.id,
                'preview',
                variant?.state === 'FAILED'
                  ? 'FAILED'
                  : variant?.state === 'UNSUPPORTED'
                    ? 'UNSUPPORTED'
                    : 'PENDING',
              );
      }
      return { grant, ingredientId: source.id, metadataId: source.metadataId };
    });
  }

  /** Internal execution capability; there is deliberately no HTTP route. */
  async issueServerPublish(
    organizationId: string,
    ingredientIds: readonly string[],
  ): Promise<Map<string, string>> {
    const sources = await this.readSources(organizationId, ingredientIds);
    if (sources.length !== new Set(ingredientIds).size) {
      throw new NotFoundException('Publication media is unavailable');
    }
    return new Map(
      sources.map((source) => [
        source.id,
        this.grant(
          source.id,
          requireStoredMediaKey(source),
          'original-download',
        ).url as string,
      ]),
    );
  }

  /**
   * Internal execution capability for ingredients a provider fetches for an
   * organization's run: the organization's own media, plus the reference
   * images of characters granted to the run's brand. Every id must resolve,
   * so one foreign, deleted or revoked id fails the whole call and no URL
   * for the others is returned either.
   */
  async issueExecutionUrls(
    scope: MediaDeliveryScope,
    ingredientIds: readonly string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ingredientIds)];
    const urls = new Map<string, string>();
    if (unique.length === 0) return urls;
    for (const source of await this.readSources(scope.organizationId, unique)) {
      urls.set(
        source.id,
        this.grant(
          source.id,
          requireStoredMediaKey(source),
          'original-download',
        ).url as string,
      );
    }
    const missing = unique.filter((id) => !urls.has(id));
    if (missing.length > 0) {
      for (const grant of await this.projectGrantedCharacterMedia(
        scope,
        missing,
      )) {
        if (grant.url) urls.set(grant.id, grant.url);
      }
    }
    if (unique.some((id) => !urls.has(id))) {
      throw new NotFoundException('Media is unavailable');
    }
    return urls;
  }

  /**
   * Internal execution capability for brand assets (references, logos,
   * banners) that a provider or renderer fetches. Like `issueServerPublish`
   * it has no HTTP route; assets are read inside the organization and an id
   * without a trusted stored key yields no URL.
   */
  async issueServerAssetUrls(
    organizationId: string,
    assetIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (!organizationId)
      throw new ForbiddenException('An organization is required');
    const urls = new Map<string, string>();
    if (assetIds.length === 0) return urls;
    const assets = await this.prisma.asset.findMany({
      select: { id: true, cloudObjectKey: true },
      where: {
        id: { in: [...new Set(assetIds)].slice(0, 500) },
        parentOrgId: organizationId,
        isDeleted: false,
      },
    });
    for (const asset of assets) {
      const key = trustedAssetKey(asset.cloudObjectKey);
      if (!key) continue;
      try {
        urls.set(
          asset.id,
          this.grant(asset.id, key, 'original-download').url as string,
        );
      } catch (error) {
        // A signing outage is not an asset problem: fail the whole call.
        if (error instanceof ServiceUnavailableException) throw error;
      }
    }
    return urls;
  }

  async issuePublicDerivative(
    scope: MediaDeliveryScope,
    ingredientId: string,
    purpose: Exclude<MediaDeliveryPurpose, 'preview'>,
  ): Promise<MediaDeliveryGrant> {
    const [source] = await this.readSources(scope.organizationId, [
      ingredientId,
    ]);
    this.requireRecordAccess(source, scope);
    // The existing explicit share flag authorizes share/OG delivery only.
    // Social publication requires its separate approval/execution boundary.
    if (
      !(await this.hasPublicPermission(source)) ||
      purpose === 'public-social'
    ) {
      throw new ForbiddenException(
        'This media has no public-delivery permission',
      );
    }
    const variant = await this.prisma.mediaDeliveryVariant.findFirst({
      where: {
        ingredientId,
        isDeleted: false,
        organizationId: scope.organizationId,
        policyVersion: MEDIA_DELIVERY_POLICY_VERSION,
        purpose,
        sourceIdentity: mediaSourceIdentity(source),
        state: 'READY',
      },
    });
    if (
      !variant?.storageKey?.startsWith(
        `public/media/${scope.organizationId}/${purpose}/${mediaSourceIdentity(source)}.`,
      )
    )
      return this.unavailable(ingredientId, purpose, 'PENDING');
    return this.grant(source.id, variant.storageKey, purpose);
  }

  async hasPublicPermission(source: MediaDeliverySource): Promise<boolean> {
    if (source.isPublic || source.scope === 'PUBLIC') return true;
    if (!source.organizationId) return false;
    return Boolean(
      await this.prisma.post.findFirst({
        select: { id: true },
        where: {
          organizationId: source.organizationId,
          isDeleted: false,
          visibility: PostVisibility.PUBLIC,
          ingredientLinks: {
            some: {
              ingredient: {
                id: source.id,
                organizationId: source.organizationId,
                isDeleted: false,
              },
            },
          },
        },
      }),
    );
  }

  async readPublicSources(
    ingredientIds: readonly string[],
  ): Promise<MediaDeliverySource[]> {
    const discovered = await crossOrgUnsafe(() =>
      // tenant-scope-ignore: explicit canonical public/share discovery; subsequent variant reads are organization-bound.
      this.prisma.ingredient.findMany({
        select: MEDIA_DELIVERY_SOURCE_SELECT,
        where: {
          id: { in: [...new Set(ingredientIds)].slice(0, 500) },
          isDeleted: false,
          OR: [
            { isPublic: true },
            { scope: 'PUBLIC' },
            {
              postLinks: {
                some: {
                  post: {
                    isDeleted: false,
                    visibility: PostVisibility.PUBLIC,
                  },
                },
              },
            },
          ],
        },
      }),
    );
    const publicIds = new Set(
      discovered
        .filter((source) => source.isPublic || source.scope === 'PUBLIC')
        .map((source) => source.id),
    );
    const grouped = new Map<string, string[]>();
    for (const source of discovered) {
      if (source.organizationId && !publicIds.has(source.id)) {
        grouped.set(source.organizationId, [
          ...(grouped.get(source.organizationId) ?? []),
          source.id,
        ]);
      }
    }
    for (const [organizationId, ids] of grouped) {
      const posts = await this.prisma.post.findMany({
        select: {
          ingredientLinks: {
            where: {
              ingredient: { id: { in: ids }, organizationId, isDeleted: false },
            },
            select: { ingredientId: true },
          },
        },
        where: {
          organizationId,
          isDeleted: false,
          visibility: PostVisibility.PUBLIC,
          ingredientLinks: {
            some: {
              ingredient: { id: { in: ids }, organizationId, isDeleted: false },
            },
          },
        },
      });
      for (const post of posts)
        for (const link of post.ingredientLinks)
          publicIds.add(link.ingredientId);
    }
    return discovered.filter((source) => publicIds.has(source.id));
  }

  /** Anonymous share access is authorized by canonical public consent, never an owner impersonation. */
  async projectPublicIngredients(
    ingredientIds: readonly string[],
    purpose: 'public-share' | 'public-og' = 'public-share',
  ): Promise<MediaResourceProjection[]> {
    if (ingredientIds.length > 500) {
      const projections: MediaResourceProjection[] = [];
      for (let index = 0; index < ingredientIds.length; index += 500) {
        projections.push(
          ...(await this.projectPublicIngredients(
            ingredientIds.slice(index, index + 500),
            purpose,
          )),
        );
      }
      return projections;
    }
    const sources = await this.readPublicSources(ingredientIds);
    const organizations = [
      ...new Set(
        sources
          .map((source) => source.organizationId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const variants = (
      await Promise.all(
        organizations.map((organizationId) =>
          this.prisma.mediaDeliveryVariant.findMany({
            where: {
              organizationId,
              isDeleted: false,
              ingredientId: { in: sources.map((source) => source.id) },
              policyVersion: MEDIA_DELIVERY_POLICY_VERSION,
              purpose,
            },
          }),
        ),
      )
    ).flat();
    return sources.map((source) => {
      const identity = mediaSourceIdentity(source);
      const variant = variants.find(
        (entry) =>
          entry.ingredientId === source.id &&
          entry.sourceIdentity === identity &&
          entry.organizationId === source.organizationId,
      );
      return {
        ingredientId: source.id,
        metadataId: source.metadataId,
        grant:
          variant?.state === 'READY' &&
          variant.storageKey?.startsWith(
            `public/media/${source.organizationId}/${purpose}/${identity}.`,
          )
            ? this.grant(source.id, variant.storageKey, purpose)
            : this.unavailable(
                source.id,
                purpose,
                !protectedPreviewCategory(source)
                  ? 'UNSUPPORTED'
                  : variant?.state === 'FAILED'
                    ? 'FAILED'
                    : variant?.state === 'UNSUPPORTED'
                      ? 'UNSUPPORTED'
                      : 'PENDING',
              ),
      };
    });
  }

  async projectAssets(
    scope: MediaDeliveryScope,
    assetIds: readonly string[],
  ): Promise<MediaAssetProjection[]> {
    if (assetIds.length === 0) return [];
    if (!(await this.hasCleanAccess(scope.organizationId))) {
      return assetIds.map((assetId) => ({ assetId, url: null }));
    }
    const assets = await this.prisma.asset.findMany({
      select: {
        id: true,
        cloudObjectKey: true,
        parentBrandId: true,
        userId: true,
      },
      where: {
        id: { in: [...assetIds].slice(0, 500) },
        parentOrgId: scope.organizationId,
        isDeleted: false,
      },
    });
    return assets.map((asset) => {
      if (
        !asset.cloudObjectKey ||
        (scope.brandId &&
          asset.parentBrandId !== scope.brandId &&
          asset.userId !== scope.userId)
      ) {
        return { assetId: asset.id, url: null };
      }
      const key = trustedAssetKey(asset.cloudObjectKey);
      if (!key) {
        return { assetId: asset.id, url: null };
      }
      return {
        assetId: asset.id,
        url: this.grant(asset.id, key, 'preview').url,
      };
    });
  }

  async readSources(
    organizationId: string,
    ingredientIds: readonly string[],
  ): Promise<MediaDeliverySource[]> {
    if (!organizationId)
      throw new ForbiddenException('An organization is required');
    if (ingredientIds.length > 500) {
      const sources: MediaDeliverySource[] = [];
      for (let index = 0; index < ingredientIds.length; index += 500) {
        sources.push(
          ...(await this.readSources(
            organizationId,
            ingredientIds.slice(index, index + 500),
          )),
        );
      }
      return sources;
    }
    return this.prisma.ingredient.findMany({
      select: MEDIA_DELIVERY_SOURCE_SELECT,
      where: {
        id: { in: [...new Set(ingredientIds)] },
        isDeleted: false,
        organizationId,
      },
    });
  }

  /**
   * Reference images (every reference, not only the primary) of characters
   * granted to the caller's organization (#6037). Only an active grant whose receiving availability includes the
   * caller's brand yields a grant, read from the owning organization; a
   * revoked or missing grant yields nothing, so access ends on the next call.
   */
  async projectGrantedCharacterMedia(
    scope: MediaDeliveryScope,
    ingredientIds: readonly string[],
  ): Promise<MediaDeliveryGrant[]> {
    if (ingredientIds.length === 0 || !scope.brandId) return [];
    const requested = [...new Set(ingredientIds)];
    const grants = await this.prisma.personaGrant.findMany({
      select: {
        availabilityMode: true,
        availableBrandIds: true,
        ownerOrganizationId: true,
        persona: {
          select: {
            avatarIngredientId: true,
            references: {
              select: { ingredientId: true, position: true },
              where: { ingredientId: { in: requested } },
            },
          },
        },
      },
      where: {
        persona: {
          is: {
            isDeleted: false,
            OR: personaReferencesAnyWhere(requested),
          },
        },
        recipientOrganizationId: scope.organizationId,
        revokedAt: null,
      },
    });
    const idsByOwner = new Map<string, string[]>();
    for (const grant of grants) {
      const isGrantedToBrand =
        grant.availabilityMode === PersonaAvailabilityMode.ALL_BRANDS ||
        (grant.availabilityMode === PersonaAvailabilityMode.SELECTED_BRANDS &&
          (grant.availableBrandIds ?? []).includes(scope.brandId));
      if (!isGrantedToBrand) {
        continue;
      }
      // Every reference image of the granted character, not only the primary.
      const referenceIds = characterAssetIdsFromRow(grant.persona).filter(
        (id) => requested.includes(id),
      );
      if (referenceIds.length > 0) {
        idsByOwner.set(grant.ownerOrganizationId, [
          ...new Set([
            ...(idsByOwner.get(grant.ownerOrganizationId) ?? []),
            ...referenceIds,
          ]),
        ]);
      }
    }
    const granted: MediaDeliveryGrant[] = [];
    for (const [ownerOrganizationId, ids] of idsByOwner) {
      for (const source of await this.readSources(ownerOrganizationId, ids)) {
        granted.push(
          this.grant(source.id, requireStoredMediaKey(source), 'preview'),
        );
      }
    }
    return granted;
  }

  async hasCleanAccess(organizationId: string): Promise<boolean> {
    if (!isCloudDeployment()) return true;
    const organization = await this.prisma.organization.findFirst({
      select: { settings: { select: { subscriptionTier: true } } },
      where: { id: organizationId, isDeleted: false },
    });
    return Boolean(
      organization &&
        hasCleanExportAccess(organization.settings?.subscriptionTier),
    );
  }

  private requireRecordAccess(
    source: MediaDeliverySource | undefined,
    scope: MediaDeliveryScope,
  ): asserts source is MediaDeliverySource {
    if (!source || !hasMediaRecordAccess(source, scope)) {
      throw new NotFoundException('Media is unavailable');
    }
  }

  private grant(
    ingredientId: string,
    storageKey: string,
    purpose: MediaDeliveryGrant['purpose'],
  ): MediaDeliveryGrant {
    requireStoredMediaKey({ s3Key: storageKey });
    if (
      isCloudDeployment() &&
      this.config.isAuthorizedMediaDeliveryEnabled &&
      !this.config.isCdnSigningEnabled
    ) {
      throw new ServiceUnavailableException(
        'Authorized media signing is unavailable',
      );
    }
    const url = this.urls.buildUrl(storageKey);
    return {
      expiresAt: this.config.mediaUrlConfig.signing
        ? new Date(
            Date.now() + this.config.mediaUrlConfig.signing.ttlSeconds * 1000,
          ).toISOString()
        : null,
      id: ingredientId,
      purpose,
      state: 'READY',
      url,
    };
  }

  private unavailable(
    id: string,
    purpose: MediaDeliveryGrant['purpose'],
    state: MediaDeliveryGrant['state'],
  ): MediaDeliveryGrant {
    return { expiresAt: null, id, purpose, state, url: null };
  }
}

/** Stored key of a brand asset, or null when it is not a plain relative object key. */
function trustedAssetKey(key: string | null): string | null {
  if (
    !key ||
    /^https?:\/\//i.test(key) ||
    key.startsWith('/') ||
    key.includes('\\') ||
    key
      .split('/')
      .some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return null;
  }
  return key;
}
