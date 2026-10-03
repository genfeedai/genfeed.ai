import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import {
  finishBrandLearningMutation,
  lockBrandLearningMutation,
} from '@api/collections/brands/services/brand-learning-mutation.util';
import {
  CACHE_PATTERNS,
  SCOPED_CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { UserAccessCacheService } from '@api/common/services/user-access-cache.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { paginatedQueryCacheTag } from '@api/shared/utils/query-cache/query-cache.util';
import { PersonaAvailabilityMode } from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { ConflictException, Injectable } from '@nestjs/common';

/**
 * Atomic brand delete + brand-switch primitives (#5295).
 *
 * Split out of `BrandsService` so the org-wide last-brand guard, the
 * `FOR UPDATE` row lock that makes it atomic, and the moved-member cache
 * invalidation it drives all live together instead of interleaved with the
 * rest of the brand CRUD surface. `BrandsService.remove` /
 * `.selectBrandForUser` delegate here.
 */
@Injectable()
export class BrandLifecycleService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly cacheService: CacheService,
    private readonly cacheInvalidationService: CacheInvalidationService,
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
    private readonly userAccessCacheService: UserAccessCacheService,
  ) {}

  /**
   * Soft-deletes a brand, atomically. #5295: `remove()` used to find a
   * fallback brand, move members, and soft-delete across three separate
   * statements with no lock, so two concurrent deletes of an org's last two
   * brands could each see a live fallback and both succeed — leaving zero
   * live brands. Everything here runs inside one transaction that first
   * takes a `FOR UPDATE` lock on every live brand row of the organization,
   * so a second concurrent delete (or a `selectBrandForUser` switch onto one
   * of these same rows) blocks until this transaction commits, then
   * re-evaluates against the post-commit state instead of a stale read.
   */
  async remove(id: string): Promise<BrandDocument> {
    this.logger.debug('Soft deleting brand', {
      brandId: id,
      operation: 'remove',
      service: this.constructorName,
    });

    const { brand, movedMemberUserIds } = await this.prisma.$transaction(
      async (tx) => {
        const scope = await lockBrandLearningMutation(tx, {
          brandId: id,
          lockAllSourceBrands: true,
        });
        const organizationId = scope.organizationId;

        // Re-read under the lock: a transaction that committed first while we
        // were blocked may have already deleted this brand, or consumed the
        // fallback we would otherwise pick.
        const liveBrands = await tx.brand.findMany({
          orderBy: { createdAt: 'asc' },
          select: { id: true },
          where: { isDeleted: false, organizationId },
        });

        if (!liveBrands.some((candidate) => candidate.id === id)) {
          throw new NotFoundException('Brand', id);
        }

        // An org always keeps at least one non-deleted brand (#5219): every
        // member's currentBrandId must keep resolving. Refuse to delete the
        // last one instead of leaving members pointed at a soft-deleted brand.
        const fallbackBrand = liveBrands.find(
          (candidate) => candidate.id !== id,
        );
        if (!fallbackBrand) {
          throw new ConflictException(
            "Cannot delete an organization's last brand. Create another brand first.",
          );
        }

        // A brand that owns characters other brands can use cannot be
        // deleted: those brands would lose them (#6040). Ownership must move
        // first. Re-read under the lock so a concurrent share cannot slip by.
        const sharedCharacters = await tx.persona.findMany({
          orderBy: { label: 'asc' },
          select: {
            availabilityMode: true,
            availableBrandIds: true,
            handle: true,
            id: true,
            label: true,
          },
          where: scopedWhere(organizationId, {
            availabilityMode: { not: PersonaAvailabilityMode.OWNING_BRAND },
            brandId: id,
          }),
        });
        const liveBrandIds = new Set(liveBrands.map((brand) => brand.id));
        // Characters granted to other organizations block the same way (#6037).
        const grantedCharacters = await tx.personaGrant.findMany({
          select: {
            persona: { select: { handle: true, id: true, label: true } },
          },
          where: {
            persona: { brandId: id, isDeleted: false },
            revokedAt: null,
          },
        });
        const sharedBlocking = sharedCharacters.filter((character) =>
          character.availabilityMode === PersonaAvailabilityMode.ALL_BRANDS
            ? liveBrandIds.size > 1
            : (character.availableBrandIds ?? []).some(
                (brandId) => brandId !== id && liveBrandIds.has(brandId),
              ),
        );
        const blockingCharacters = [
          ...sharedBlocking,
          ...grantedCharacters
            .map((grant) => grant.persona)
            .filter(
              (granted) =>
                !sharedBlocking.some((shared) => shared.id === granted.id),
            ),
        ];
        if (blockingCharacters.length > 0) {
          throw new ConflictException({
            code: 'brand_owns_shared_characters',
            detail: `This brand owns characters other brands use: ${blockingCharacters
              .map((character) => character.label)
              .join(', ')}. Move their ownership to another brand first.`,
            // JSON:API `source` is the one free-form member the HTTP filter
            // forwards; the client reads the characters to link to.
            source: {
              characters: blockingCharacters.map((character) => ({
                handle: character.handle,
                id: character.id,
                label: character.label,
              })),
            },
            title: 'Brand owns shared characters',
          });
        }

        // Capture affected members before the move so their caches can be
        // busted once the transaction commits (#5295) — a member left
        // pointing at a deleted brand kept generating against it for up to
        // the identity/context cache TTL.
        const membersToMove = await tx.member.findMany({
          select: { userId: true },
          where: { currentBrandId: id, isDeleted: false, organizationId },
        });

        if (membersToMove.length > 0) {
          await tx.member.updateMany({
            data: { currentBrandId: fallbackBrand.id },
            where: { currentBrandId: id, isDeleted: false, organizationId },
          });
        }

        const deleted = await tx.brand.update({
          data: { isDeleted: true },
          where: { id, isDeleted: false, organizationId },
        });

        await finishBrandLearningMutation(tx, scope, deleted);
        return {
          brand: deleted as unknown as BrandDocument,
          movedMemberUserIds: membersToMove.map((member) => member.userId),
        };
      },
    );

    // BaseService.remove() would have busted these query-cache tags; replicate
    // that here since the transactional delete above bypasses super.remove().
    if (this.cacheService) {
      await this.cacheService.invalidateByTags([
        'brand',
        'collection:brand',
        'query:brand',
        paginatedQueryCacheTag('brand'),
      ]);
    }

    // Invalidate single-brand cache key.
    await this.cacheInvalidationService.invalidate(
      CACHE_PATTERNS.BRANDS_SINGLE(id),
    );

    if (typeof brand.organizationId === 'string' && brand.organizationId) {
      // A deleted brand must stop resolving as the org's agent brand context.
      await this.cacheInvalidationService.invalidateByTags([
        SCOPED_CACHE_TAGS.BRAND_CONTEXT(brand.organizationId),
      ]);
      await this.accessBootstrapCacheService.invalidateForOrganization(
        brand.organizationId,
      );
    }

    // Every member the delete moved off this brand must stop trusting a
    // Better Auth identity / request-context snapshot that still points at
    // the now-deleted brand (#5295).
    await Promise.all(
      movedMemberUserIds.map((userId) =>
        this.userAccessCacheService.invalidateAll(userId),
      ),
    );

    return brand;
  }

  /**
   * #5295: reading the brand then updating the member used to be two
   * unguarded statements — a `remove()` landing between them could soft-
   * delete the target brand after it was validated live here, leaving the
   * member pointed at a deleted brand. Locking the brand row `FOR UPDATE`
   * first means this transaction either blocks behind a concurrent
   * `remove()` on the same row (and then sees it deleted on re-read) or
   * blocks a concurrent `remove()` behind it — never both racing past the
   * validation at once.
   */
  async selectBrandForUser(
    brandId: string,
    userId: string,
    organizationId: string,
  ): Promise<BrandDocument> {
    this.logger.debug('Setting current brand for member', {
      brandId,
      operation: 'selectBrandForUser',
      organizationId,
      service: this.constructorName,
      userId,
    });

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "brands" WHERE "id" = ${brandId} AND "organizationId" = ${organizationId} AND "isDeleted" = false FOR UPDATE`,
      );

      const targetBrand = await tx.brand.findFirst({
        where: { id: brandId, isDeleted: false, organizationId },
      });

      if (!targetBrand) {
        throw new NotFoundException('Brand', brandId);
      }

      const updated = await tx.member.updateMany({
        data: { currentBrandId: targetBrand.id },
        where: scopedWhere(organizationId, { userId }),
      });

      if (updated.count === 0) {
        throw new NotFoundException('Member', userId);
      }

      return targetBrand as unknown as BrandDocument;
    });
  }
}
