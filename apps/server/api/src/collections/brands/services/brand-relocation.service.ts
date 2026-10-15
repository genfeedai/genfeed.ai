import {
  FIRST_ORDER_TARGETS,
  SECOND_ORDER_TARGETS,
} from '@api/collections/brands/constants/brand-org-cascade.constants';
import type { UpdateBrandDto } from '@api/collections/brands/dto/update-brand.dto';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import {
  lockBrandLearningMutation,
  patchBrandWithLearningFenced,
} from '@api/collections/brands/services/brand-learning-mutation.util';
import {
  assertNoBrandOrgOrphans,
  type CascadeDelegate,
  resolveSecondOrderFilters,
  type SecondOrderParentIds,
} from '@api/collections/brands/utils/brand-relocation-cascade.util';
import {
  mapRelocationFailure,
  PRISMA_SERIALIZATION_FAILURE,
} from '@api/collections/brands/utils/brand-relocation-errors.util';
import {
  assertNoCrunGenerationHistory,
  assertNoKnowledgeHistory,
  assertNoLearningHistory,
  assertNoOpenLiveSessions,
  assertNoOpenVisualProjects,
  assertNoBrandedGenerationReceiptHistory as assertNoReceiptHistory,
  assertNoSecurityAuditHistory,
} from '@api/collections/brands/utils/brand-relocation-guards.util';
import { assertNoInFlightBrandWork } from '@api/collections/brands/utils/brand-relocation-in-flight.util';
import {
  type BrandRelocationMovingResource,
  countRelocationMovingResources,
} from '@api/collections/brands/utils/brand-relocation-preview.util';
import {
  type BrandRelocationHeldSchedule,
  findActiveBrandSchedules,
  holdBrandSchedules,
  unscheduleHeldWorkflows,
} from '@api/collections/brands/utils/brand-relocation-schedules.util';
import { invalidateLearningDependencySource } from '@api/collections/content-learning/services/learning-dependency.service';
import { revokePersonaGrantsForRelocation } from '@api/collections/personas/utils/persona-grant-revocation.util';
import {
  type BrandRelocationSharedPersona,
  findSharedBrandPersonas,
  resetPersonaSharingForRelocation,
} from '@api/collections/personas/utils/persona-relocation-sharing.util';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
  SCOPED_CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { resolveApiKeyEffectiveMemberRole } from '@api/helpers/utils/auth/api-key-role.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BrandRelocationStatus,
  hasExplicitApiKeyAdminScope,
  MemberRole,
} from '@genfeedai/contracts';
import { BRAND_HANDLE_TAKEN_MESSAGE } from '@genfeedai/contracts/constants';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

const MAX_RELOCATION_SERIALIZATION_RETRIES = 3;
// The default interactive-transaction timeout is 5 seconds. A relocation rewrites
// every row the brand owns, so a large brand needs far longer.
const RELOCATION_TRANSACTION_TIMEOUT_MS = 120_000;
const RELOCATION_TRANSACTION_MAX_WAIT_MS = 10_000;

/**
 * Read-only classification of what a brand relocation would touch, shared by the
 * preview endpoint and the transactional move itself.
 */
interface RelocationImpact {
  soleBrandWorkflowIds: string[];
  staleMemberIds: string[];
}

/** Outcome of reconciling a brand's cross-org workflow/member links during a move. */
interface RelocationReconcileResult {
  workflowsMoved: number;
  membersSevered: number;
}

/** Everything the relocation transaction reports back for the summary and the post-commit steps. */
interface RelocationTransactionResult extends RelocationReconcileResult {
  heldSchedules: BrandRelocationHeldSchedule[];
  personaGrantsRevoked: number;
  personasSharingReset: number;
  touchedWorkflowIds: string[];
}

export type { BrandRelocationMovingResource };

/** Who is moving the brand, as the controller read them from the request. */
export interface BrandRelocationActingUser {
  userId: string;
  isSuperAdmin: boolean;
  /** An API key relocates only with an explicit `admin` scope. */
  isApiKey?: boolean;
  scopes?: readonly string[];
}

/** Server-authoritative summary of a completed (or no-op) brand relocation. */
export interface BrandRelocationSummary {
  workflowsMoved: number;
  membersSevered: number;
  /** Enabled schedules paused because their actor does not carry over. */
  schedulesHeld: number;
  /** Held schedules whose queued scheduler job could not be removed. */
  schedulingPending: number;
  /** Persona grants revoked because their character changed owner. */
  personaGrantsRevoked: number;
  /** Characters reset to their owning brand only because they were shared beyond it. */
  personasSharingReset: number;
}

/** Result of `relocateToOrganization`: the moved brand plus a summary for the client. */
export interface BrandRelocationResult {
  brand: BrandDocument;
  summary: BrandRelocationSummary;
}

/** Counts returned by the read-only relocation preview endpoint. */
export interface BrandRelocationPreview {
  counts: {
    soleBrandWorkflows: number;
    staleMembers: number;
    schedulesToHold: number;
    personasToReset: number;
  };
  movingResources: BrandRelocationMovingResource[];
  /** The characters whose sharing will be reset to the owning brand only. */
  personasToReset: BrandRelocationSharedPersona[];
  /** The enabled schedules that will be paused. */
  schedulesToHold: BrandRelocationHeldSchedule[];
}

export const EMPTY_RELOCATION_SUMMARY: BrandRelocationSummary = {
  membersSevered: 0,
  personaGrantsRevoked: 0,
  personasSharingReset: 0,
  schedulesHeld: 0,
  schedulingPending: 0,
  workflowsMoved: 0,
};

type BrandSameOrganizationPatch = (
  updates: Partial<UpdateBrandDto>,
) => Promise<BrandDocument>;

@Injectable()
export class BrandRelocationService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly cacheInvalidationService: CacheInvalidationService,
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  private static readonly RELOCATION_ELEVATED_ROLES: ReadonlySet<string> =
    new Set([MemberRole.OWNER, MemberRole.ADMIN]);

  /**
   * Brand scalar columns co-updatable during a relocation PATCH. Relation
   * fields (voice/music/user/organization) are intentionally excluded — they
   * need their own handling. `isDeleted` is excluded too (#5295): it would
   * bypass remove()'s last-brand guard.
   */
  private static readonly RELOCATION_PASSTHROUGH_FIELDS: readonly string[] = [
    'label',
    'description',
    'slug',
    'text',
    'fontFamily',
    'primaryColor',
    'secondaryColor',
    'backgroundColor',
    'scope',
    'isActive',
    'isHighlighted',
    'isFleetEnabled',
    'defaultVideoModel',
    'defaultImageModel',
    'defaultImageToVideoModel',
    'defaultMusicModel',
  ];

  /**
   * Relocate a brand to another organization, cascading the denormalized
   * `organizationId` across every brand-owned record in one transaction. A runtime
   * orphan auditor rolls the whole move back if any dual-keyed table is left stale,
   * so an unhandled/new table fails loudly instead of splitting tenancy.
   *
   * Authorization: platform superadmin, OR an owner/admin of BOTH the source and
   * destination organizations (guarantees the caller keeps access to the brand).
   */
  async authorizeRelocation(
    brandId: string,
    destOrgId: string,
    actor: BrandRelocationActingUser,
  ): Promise<BrandDocument> {
    const brand = await this.prisma.brand.findFirst({
      where: { id: brandId, isDeleted: false },
    });
    if (!brand) throw new NotFoundException('Brand', brandId);
    await this.assertDestinationOrganizationExists(destOrgId);
    await this.assertCanRelocate(actor, brand.organizationId, destOrgId);
    return brand as unknown as BrandDocument;
  }

  async relocateToOrganization(
    brandId: string,
    updateBrandDto: Partial<UpdateBrandDto> & {
      organizationId?: string;
    },
    actingUser: BrandRelocationActingUser,
    patchSameOrganization?: BrandSameOrganizationPatch,
    relocationId?: string,
  ): Promise<BrandRelocationResult> {
    const destOrgId = updateBrandDto.organizationId;
    if (!destOrgId) {
      throw new BadRequestException(
        'organizationId is required to relocate a brand',
      );
    }

    const brand = (await this.prisma.brand.findFirst({
      where: { id: brandId, isDeleted: false },
    })) as (BrandDocument & { organizationId: string }) | null;
    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }
    const sourceOrgId = brand.organizationId;

    // Same org → not a relocation; apply the other fields via the normal patch.
    if (sourceOrgId === destOrgId) {
      return this.patchWithinSameOrganization(
        brandId,
        sourceOrgId,
        updateBrandDto,
        patchSameOrganization,
      );
    }

    await this.assertDestinationOrganizationExists(destOrgId);
    await this.assertCanRelocate(actingUser, sourceOrgId, destOrgId);
    await this.assertHandleAvailable(brandId, updateBrandDto.slug);

    await this.assertSourceKeepsAnotherBrand(brandId, sourceOrgId);

    const passthrough = this.pickRelocationPassthrough(updateBrandDto);
    this.logger.log('Relocating brand between organizations', {
      brandId,
      destOrgId,
      operation: 'relocateToOrganization',
      service: this.constructorName,
      sourceOrgId,
    });

    let moveResult: RelocationTransactionResult = {
      heldSchedules: [],
      membersSevered: 0,
      personaGrantsRevoked: 0,
      personasSharingReset: 0,
      touchedWorkflowIds: [],
      workflowsMoved: 0,
    };

    for (
      let attempt = 0;
      attempt < MAX_RELOCATION_SERIALIZATION_RETRIES;
      attempt += 1
    ) {
      try {
        moveResult = await this.prisma.$transaction(
          (tx) =>
            this.moveBrandInTransaction(tx, {
              actingUser,
              brandId,
              destOrgId,
              passthrough,
              relocationId,
              slug: updateBrandDto.slug,
              sourceOrgId,
            }),
          {
            isolationLevel: 'Serializable',
            maxWait: RELOCATION_TRANSACTION_MAX_WAIT_MS,
            timeout: RELOCATION_TRANSACTION_TIMEOUT_MS,
          },
        );
        break;
      } catch (error: unknown) {
        const mapped = mapRelocationFailure(error, this.logger, {
          brandId,
          destOrgId,
          sourceOrgId,
        });
        if (mapped) {
          throw mapped;
        }
        if (
          (error as { code?: string }).code === PRISMA_SERIALIZATION_FAILURE &&
          attempt < MAX_RELOCATION_SERIALIZATION_RETRIES - 1
        ) {
          this.logger.debug(
            `${this.constructorName} serialization failure on brand relocation attempt ${attempt + 1} — retrying`,
            { brandId, destOrgId, sourceOrgId },
          );
          await new Promise<void>((resolve) =>
            setTimeout(resolve, 50 * (attempt + 1)),
          );
          continue;
        }
        throw error;
      }
    }

    // The move is committed. Nothing below may fail it: a queued job that
    // outlives the pause is harmless (the scheduler drops a fire for a paused
    // workflow), and a cache that stays stale expires.
    const schedulingPending = await unscheduleHeldWorkflows(
      this.moduleRef,
      this.logger,
      moveResult.touchedWorkflowIds,
    );
    await this.invalidateRelocationCaches(brandId, sourceOrgId, destOrgId);

    if (relocationId) {
      try {
        await this.prisma.brandRelocation.update({
          where: {
            id: relocationId,
            organizationId: sourceOrgId,
            isDeleted: false,
          },
          data: {
            summary: {
              membersSevered: moveResult.membersSevered,
              personaGrantsRevoked: moveResult.personaGrantsRevoked,
              personasSharingReset: moveResult.personasSharingReset,
              schedulesHeld: moveResult.heldSchedules.length,
              schedulingPending,
              workflowsMoved: moveResult.workflowsMoved,
            },
          },
        });
      } catch (error) {
        this.logger.warn(
          'Could not refresh committed brand move scheduling summary',
          { relocationId, error },
        );
      }
    }

    const moved = (await this.prisma.brand.findFirst({
      where: { id: brandId },
    })) as BrandDocument | null;
    if (!moved) {
      throw new NotFoundException('Brand', brandId);
    }

    return {
      brand: moved,
      summary: {
        membersSevered: moveResult.membersSevered,
        personaGrantsRevoked: moveResult.personaGrantsRevoked,
        personasSharingReset: moveResult.personasSharingReset,
        schedulesHeld: moveResult.heldSchedules.length,
        schedulingPending,
        workflowsMoved: moveResult.workflowsMoved,
      },
    };
  }

  /**
   * An org always keeps at least one non-deleted brand (#5219): the source org
   * must have another brand left for its members' currentBrandId to fall back to
   * once this one moves out.
   */
  private async assertSourceKeepsAnotherBrand(
    brandId: string,
    sourceOrgId: string,
  ): Promise<void> {
    const fallbackBrand = await this.prisma.brand.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
      where: {
        id: { not: brandId },
        isDeleted: false,
        organizationId: sourceOrgId,
      },
    });
    if (!fallbackBrand) {
      throw new ConflictException(
        "Cannot move an organization's only brand to another organization.",
      );
    }
  }

  /**
   * Everything a relocation does inside its one Serializable transaction: the
   * guards, then the schedule, grant and character-sharing changes, then the organization cascade,
   * then the orphan audit. Anything that throws rolls the whole move back.
   */
  private async moveBrandInTransaction(
    tx: Prisma.TransactionClient,
    move: {
      actingUser: BrandRelocationActingUser;
      brandId: string;
      destOrgId: string;
      passthrough: Record<string, unknown>;
      relocationId?: string;
      slug: string | undefined;
      sourceOrgId: string;
    },
  ): Promise<RelocationTransactionResult> {
    const { actingUser, brandId, destOrgId, sourceOrgId } = move;
    // A child row can name several parents by composite organization keys (an
    // observation: brand, credential and post). Whichever the cascade updates
    // first, the others have not followed yet, so the checks wait for commit,
    // when every parent and child agree.
    if (move.relocationId) {
      const claimed = await tx.brandRelocation.updateMany({
        where: {
          id: move.relocationId,
          brandId,
          organizationId: sourceOrgId,
          destinationOrganizationId: destOrgId,
          isDeleted: false,
          status: BrandRelocationStatus.PROCESSING,
        },
        data: { updatedAt: new Date() },
      });
      if (claimed.count !== 1)
        throw new ConflictException('This brand move has already finished');
    }
    await tx.$executeRaw`SET CONSTRAINTS ALL DEFERRED`;
    await this.prepareLearningRelocation(
      tx,
      brandId,
      sourceOrgId,
      destOrgId,
      actingUser,
      move.slug,
    );
    // Before the cascade rewrites any organization id: the schedule actors and
    // persona grants and the character sharing all belong to the source tenant.
    const { held, touchedWorkflowIds } = await holdBrandSchedules(tx, brandId);
    const personaGrantsRevoked = await revokePersonaGrantsForRelocation(tx, {
      actorUserId: actingUser.userId,
      brandId,
      organizationId: sourceOrgId,
    });
    const sharedPersonas = await resetPersonaSharingForRelocation(tx, {
      actorUserId: actingUser.userId,
      brandId,
      organizationId: sourceOrgId,
    });
    const result = await this.runBrandOrgCascade(
      tx,
      brandId,
      sourceOrgId,
      destOrgId,
      move.passthrough,
    );
    await assertNoBrandOrgOrphans(tx, brandId, destOrgId);
    if (move.relocationId) {
      await tx.brandRelocation.update({
        where: {
          id: move.relocationId,
          organizationId: sourceOrgId,
          isDeleted: false,
        },
        data: {
          status: BrandRelocationStatus.DONE,
          summary: {
            membersSevered: result.membersSevered,
            personaGrantsRevoked,
            personasSharingReset: sharedPersonas.length,
            schedulesHeld: held.length,
            schedulingPending: touchedWorkflowIds.length,
            workflowsMoved: result.workflowsMoved,
          },
        },
      });
    }
    return {
      ...result,
      heldSchedules: held,
      personaGrantsRevoked,
      personasSharingReset: sharedPersonas.length,
      touchedWorkflowIds,
    };
  }

  /**
   * Read-only preview for a brand relocation. Workflows are one-to-one with a
   * brand now, so they move with the brand.
   */
  async previewRelocation(
    brandId: string,
    destOrgId: string,
    actingUser: BrandRelocationActingUser,
  ): Promise<BrandRelocationPreview> {
    const brand = (await this.prisma.brand.findFirst({
      where: { id: brandId, isDeleted: false },
    })) as (BrandDocument & { organizationId: string }) | null;
    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }
    const sourceOrgId = brand.organizationId;

    const destOrg = await this.prisma.organization.findFirst({
      select: { id: true },
      where: { id: destOrgId, isDeleted: false },
    });
    if (!destOrg) {
      throw new NotFoundException('Organization', destOrgId);
    }

    await this.assertCanRelocate(actingUser, sourceOrgId, destOrgId);

    if (sourceOrgId !== destOrgId) {
      await assertNoLearningHistory(this.prisma, brandId, sourceOrgId);
      await assertNoReceiptHistory(this.prisma, brandId, sourceOrgId);
      await assertNoCrunGenerationHistory(this.prisma, brandId, sourceOrgId);
      await assertNoKnowledgeHistory(this.prisma, brandId, sourceOrgId);
      await assertNoSecurityAuditHistory(this.prisma, brandId, sourceOrgId);
      await assertNoOpenLiveSessions(this.prisma, brandId, sourceOrgId);
      await assertNoOpenVisualProjects(this.prisma, brandId, sourceOrgId);
      await assertNoInFlightBrandWork(this.prisma, brandId, sourceOrgId);
    }

    const impact = await this.classifyRelocationImpact(
      this.prisma as unknown as Prisma.TransactionClient,
      brandId,
      destOrgId,
    );
    const movingResources = await countRelocationMovingResources(
      this.prisma as unknown as Prisma.TransactionClient,
      brandId,
      destOrgId,
    );

    const schedulesToHold = await findActiveBrandSchedules(
      this.prisma as unknown as Prisma.TransactionClient,
      brandId,
    );

    const personasToReset = await findSharedBrandPersonas(
      this.prisma as unknown as Prisma.TransactionClient,
      { brandId, organizationId: sourceOrgId },
    );

    return {
      counts: {
        personasToReset: personasToReset.length,
        schedulesToHold: schedulesToHold.length,
        soleBrandWorkflows: impact.soleBrandWorkflowIds.length,
        staleMembers: impact.staleMemberIds.length,
      },
      movingResources,
      personasToReset,
      schedulesToHold,
    };
  }

  /**
   * Read-only classification of workflow/member links that a relocation of
   * `brandId` to `destOrgId` would touch. Workflows are one-to-one with a brand,
   * so every live source-org workflow for the brand moves with it.
   */
  private async classifyRelocationImpact(
    client: Prisma.TransactionClient,
    brandId: string,
    destOrgId: string,
  ): Promise<RelocationImpact> {
    const delegateClient = client as unknown as Record<string, CascadeDelegate>;

    const staleMembers = await delegateClient.member.findMany({
      select: { id: true },
      where: {
        brands: { some: { id: brandId } },
        organizationId: { not: destOrgId },
      },
    });

    // Workflows owned by the moving brand but sitting in a source (non-dest) org.
    // Soft-deleted workflows are excluded: they are invisible to tenant reads and
    // should not be resurrected by relocation accounting.
    const crossOrgWorkflows = await delegateClient.workflow.findMany({
      select: { id: true },
      where: {
        brandId,
        isDeleted: false,
        organizationId: { not: destOrgId },
      },
    });

    return {
      soleBrandWorkflowIds: crossOrgWorkflows.map((w) => w.id),
      staleMemberIds: staleMembers.map((m) => m.id),
    };
  }

  private async patchWithinSameOrganization(
    brandId: string,
    organizationId: string,
    dto: Partial<UpdateBrandDto>,
    patchSameOrganization?: BrandSameOrganizationPatch,
  ): Promise<BrandRelocationResult> {
    const updates = this.stripRelocationField(dto);
    if (patchSameOrganization)
      return {
        brand: await patchSameOrganization(updates),
        summary: { ...EMPTY_RELOCATION_SUMMARY },
      };
    const sourceBearing =
      updates.isActive !== undefined || updates.isDeleted !== undefined;
    const brand = sourceBearing
      ? await patchBrandWithLearningFenced(this.prisma, {
          brandId,
          organizationId,
          data: updates as Prisma.BrandUncheckedUpdateInput,
        })
      : await this.prisma.brand.update({
          where: { id: brandId, organizationId, isDeleted: false },
          data: updates as Prisma.BrandUncheckedUpdateInput,
        });
    return {
      brand: brand as unknown as BrandDocument,
      summary: { ...EMPTY_RELOCATION_SUMMARY },
    };
  }

  private async prepareLearningRelocation(
    tx: Prisma.TransactionClient,
    brandId: string,
    sourceOrgId: string,
    destOrgId: string,
    actingUser: BrandRelocationActingUser,
    slug: string | undefined,
  ): Promise<void> {
    const scope = await lockBrandLearningMutation(tx, {
      brandId,
      organizationId: sourceOrgId,
      destinationOrganizationId: destOrgId,
      lockAllSourceBrands: true,
    });
    await this.assertCanRelocate(actingUser, sourceOrgId, destOrgId, tx);
    await this.assertHandleAvailable(brandId, slug, tx);
    await assertNoReceiptHistory(tx, brandId, sourceOrgId);
    await assertNoCrunGenerationHistory(tx, brandId, sourceOrgId);
    await assertNoKnowledgeHistory(tx, brandId, sourceOrgId);
    await assertNoSecurityAuditHistory(tx, brandId, sourceOrgId);
    await assertNoOpenLiveSessions(tx, brandId, sourceOrgId);
    await assertNoOpenVisualProjects(tx, brandId, sourceOrgId);
    await assertNoInFlightBrandWork(tx, brandId, sourceOrgId);
    await assertNoLearningHistory(tx, brandId, sourceOrgId);
    await invalidateLearningDependencySource(tx, 'brand', brandId, sourceOrgId);
    for (const account of scope.accounts) {
      const updated = await tx.contentLearningAccount.updateMany({
        where: scopedWhere(account.organizationId, account),
        data: { evidenceRevision: { increment: 1 } },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          'Learning account changed during brand relocation.',
        );
    }
  }

  private stripRelocationField<T extends { organizationId?: string }>(
    dto: T,
  ): Omit<T, 'organizationId'> {
    // Strip the relocation trigger: it is not a Brand column, so leaking it into a
    // normal CRUD patch (e.g. a client retry after the move already committed)
    // would make Prisma reject the update on an unknown field.
    const { organizationId: _omitOrg, ...rest } = dto;
    return rest;
  }

  private pickRelocationPassthrough(
    dto: Record<string, unknown>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of BrandRelocationService.RELOCATION_PASSTHROUGH_FIELDS) {
      if (Object.hasOwn(dto, key) && dto[key] !== undefined) {
        out[key] = dto[key];
      }
    }
    return out;
  }

  private async assertDestinationOrganizationExists(
    destOrgId: string,
  ): Promise<void> {
    const destOrg = await this.prisma.organization.findFirst({
      select: { id: true },
      where: { id: destOrgId, isDeleted: false },
    });
    if (!destOrg) {
      throw new NotFoundException('Organization', destOrgId);
    }
  }

  /** Handles are unique across every brand, as the database constraint is. */
  private async assertHandleAvailable(
    brandId: string,
    slug: string | undefined,
    transaction?: Prisma.TransactionClient,
  ): Promise<void> {
    if (slug === undefined) {
      return;
    }
    // tenant-scope-ignore: handle uniqueness spans every organization and deleted brands, matching the global unique constraint.
    const holder = await (transaction ?? this.prisma).brand.findFirst({
      select: { id: true },
      where: { id: { not: brandId }, slug },
    });
    if (holder) {
      throw new ConflictException(BRAND_HANDLE_TAKEN_MESSAGE);
    }
  }

  async assertCanRelocate(
    actingUser: BrandRelocationActingUser,
    sourceOrgId: string,
    destOrgId: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<void> {
    // An API key authenticates as its issuer but does not inherit the issuer's
    // admin rights: it needs the explicit admin scope, superadmin issuer or not.
    const apiKeyScopes = [...(actingUser.scopes ?? [])];
    if (
      actingUser.isApiKey === true &&
      !hasExplicitApiKeyAdminScope(apiKeyScopes)
    ) {
      throw new ForbiddenException(
        'Moving a brand between organizations with an API key requires the admin scope.',
      );
    }
    if (actingUser.isSuperAdmin) {
      return;
    }
    if (!actingUser.userId) {
      throw new ForbiddenException(
        'You are not allowed to move this brand between organizations.',
      );
    }
    const [sourceElevated, destElevated] = await Promise.all([
      this.hasElevatedMembership(actingUser, sourceOrgId, transaction),
      this.hasElevatedMembership(actingUser, destOrgId, transaction),
    ]);
    if (!sourceElevated || !destElevated) {
      throw new ForbiddenException(
        'Moving a brand between organizations requires an owner or admin role in both the source and destination organizations.',
      );
    }
  }

  private async hasElevatedMembership(
    actingUser: BrandRelocationActingUser,
    organizationId: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const member = await (transaction ?? this.prisma).member.findFirst({
      select: { role: { select: { key: true } } },
      where: scopedWhere(organizationId, {
        isActive: true,
        userId: actingUser.userId,
      }),
    });
    if (!member) {
      return false;
    }
    // Authorization reads `roleId -> Role`; `roleKey` is a Better Auth copy.
    const roleKey = member.role?.key;
    if (roleKey === undefined) {
      return false;
    }
    // Same cap as every other membership check: a key without the admin scope
    // is a plain user in the organization.
    const effectiveRole = resolveApiKeyEffectiveMemberRole(
      {
        isApiKey: actingUser.isApiKey,
        scopes: [...(actingUser.scopes ?? [])],
      },
      roleKey as MemberRole,
    );
    return BrandRelocationService.RELOCATION_ELEVATED_ROLES.has(effectiveRole);
  }

  /**
   * Rewrite the denormalized organization id across the brand and everything it owns.
   * Runs entirely inside the caller's transaction.
   */
  private async runBrandOrgCascade(
    tx: Prisma.TransactionClient,
    brandId: string,
    sourceOrgId: string,
    destOrgId: string,
    passthrough: Record<string, unknown>,
  ): Promise<RelocationReconcileResult> {
    const client = tx as unknown as Record<string, CascadeDelegate>;

    const impact = await this.classifyRelocationImpact(tx, brandId, destOrgId);

    // 0. Reassign source-org members off this brand BEFORE its organizationId
    // moves. currentBrandId is a single-column FK to Brand.id (not the
    // compound (brandId, organizationId) FK used by brand-owned content, see
    // schema.prisma) precisely so a member row never gets swept into the
    // destination org by a cascade; this method reassigns it explicitly
    // instead. `sourceFallbackBrand` was already proven to exist by the
    // caller's last-brand guard, re-read here inside the transaction.
    const sourceFallbackBrand = await tx.brand.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
      where: {
        id: { not: brandId },
        isDeleted: false,
        organizationId: sourceOrgId,
      },
    });
    if (!sourceFallbackBrand) {
      throw new ConflictException(
        "Cannot move an organization's only brand to another organization.",
      );
    }
    await tx.member.updateMany({
      data: { currentBrandId: sourceFallbackBrand.id },
      where: {
        currentBrandId: brandId,
        isDeleted: false,
        organizationId: sourceOrgId,
      },
    });

    // 1. The brand row itself (+ any co-patched scalar fields). The workflow
    // composite FK cascades workflow.organizationId with the brand.
    await client.brand.updateMany({
      data: { ...passthrough, organizationId: destOrgId },
      where: { id: brandId },
    });

    // 2. First-order tables: rewrite the denormalized org key.
    for (const target of FIRST_ORDER_TARGETS) {
      await client[target.delegate].updateMany({
        data: {
          [target.orgField]: destOrgId,
          ...(target.delegate === 'brandOsPublication'
            ? { revokedAt: new Date(), publishedRevisionIds: [] }
            : {}),
        },
        where: {
          [target.brandField]: brandId,
          [target.orgField]: { not: destOrgId },
        },
      });
    }

    // 3. Second-order children (no brand key): follow a moved parent by scalar FK.
    const parentIds: SecondOrderParentIds = new Map();
    for (const child of SECOND_ORDER_TARGETS) {
      const groups = await resolveSecondOrderFilters(
        client,
        child,
        brandId,
        parentIds,
      );
      for (const filter of groups.flat()) {
        await client[child.delegate].updateMany({
          data: { [child.orgField]: destOrgId },
          where: { ...filter, [child.orgField]: { not: destOrgId } },
        });
      }
    }

    // 4. Reconcile associations that would become cross-org (move workflows/history,
    //    sever stale members).
    return this.reconcileCrossOrgLinks(tx, brandId, destOrgId, impact);
  }

  /**
   * Reconcile source-org associations that become cross-org after the move.
   *
   * Members still link to brands through a many-to-many join table and never move
   * with the brand — their stale brand links are severed. Workflows are scalar
   * brand-owned rows now, so they move one-to-one with the brand and their
   * execution/batch history follows by workflow id.
   *
   * The acting user keeps access to the brand because relocation requires membership in
   * the destination org.
   */
  private async reconcileCrossOrgLinks(
    tx: Prisma.TransactionClient,
    brandId: string,
    destOrgId: string,
    impact: RelocationImpact,
  ): Promise<RelocationReconcileResult> {
    const client = tx as unknown as Record<string, CascadeDelegate> & {
      brand: {
        update(args: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }): Promise<unknown>;
      };
    };

    const workflowsToMove = impact.soleBrandWorkflowIds;
    const staleMemberIds = impact.staleMemberIds;

    // Disconnect stale members from the brand. Member rows stay in their source org.
    if (staleMemberIds.length > 0) {
      await client.brand.update({
        data: {
          members: { disconnect: staleMemberIds.map((id) => ({ id })) },
        },
        where: { id: brandId },
      });
    }

    // Clear default-recurring markers on workflows that will NOT move — done BEFORE the
    // move so a marker already parked in the destination org (the partial unique index
    // keys on organizationId, so such a row is technically permitted) is nulled out
    // before a mover could collide with it on
    // (defaultRecurringBrandId, organizationId, contentType). Moved sole-brand workflows
    // are excluded and keep their marker: the brand moves with them, so the (brand, org)
    // default-recurring pairing stays valid in the destination org.
    await client.workflow.updateMany({
      data: { defaultRecurringBrandId: null },
      where: {
        defaultRecurringBrandId: brandId,
        ...(workflowsToMove.length > 0
          ? { id: { notIn: workflowsToMove } }
          : {}),
      },
    });

    // Workflow definitions already moved through FIRST_ORDER_TARGETS. Move the
    // org-keyed execution history that follows those workflows.
    if (workflowsToMove.length > 0) {
      await client.workflowExecution.updateMany({
        data: { organizationId: destOrgId },
        where: {
          workflowId: { in: workflowsToMove },
          organizationId: { not: destOrgId },
        },
      });
    }

    // Per-member currentBrandId pointers into the source org were already
    // reassigned in step 0, before the brand's organizationId moved (required —
    // currentBrandId is NOT NULL, so there is no "clear" step here).

    // Runtime backstop for member many-to-many links plus workflow rows classified
    // before the brand update. Still inside the transaction, recompute the post-state
    // and roll the whole move back if any cross-org association survived.
    await this.assertNoCrossOrgBrandLinks(
      client,
      brandId,
      destOrgId,
      workflowsToMove,
    );

    return {
      membersSevered: staleMemberIds.length,
      workflowsMoved: workflowsToMove.length,
    };
  }

  /**
   * Post-sever invariant for brand-linked resources that need extra checks beyond
   * the generic scalar-column orphan auditor. Throws (rolling back the transaction)
   * if any survived cross-org.
   */
  private async assertNoCrossOrgBrandLinks(
    client: Record<string, CascadeDelegate>,
    brandId: string,
    destOrgId: string,
    movedWorkflowIds: string[],
  ): Promise<void> {
    // Nothing should still be attached to the moved brand from a source org.
    // Only LIVE links matter: a soft-deleted workflow/member is invisible to
    // tenant-scoped reads and is deliberately excluded from relocation accounting.
    const strandedWorkflows = await client.workflow.count({
      where: {
        brandId,
        isDeleted: false,
        organizationId: { not: destOrgId },
      },
    });
    const strandedMembers = await client.member.count({
      where: {
        brands: { some: { id: brandId } },
        organizationId: { not: destOrgId },
      },
    });
    const crossOrgMovedWorkflows =
      movedWorkflowIds.length > 0
        ? await client.workflow.count({
            where: {
              id: { in: movedWorkflowIds },
              isDeleted: false,
              organizationId: { not: destOrgId },
            },
          })
        : 0;

    if (
      strandedWorkflows > 0 ||
      strandedMembers > 0 ||
      crossOrgMovedWorkflows > 0
    ) {
      throw new InternalServerErrorException(
        `Brand relocation aborted: cross-org association(s) survived the move ` +
          `(workflows stranded in source org: ${strandedWorkflows}, members: ${strandedMembers}, ` +
          `moved workflows still linked to a source-org brand: ${crossOrgMovedWorkflows}).`,
      );
    }
  }

  private async invalidateRelocationCaches(
    brandId: string,
    sourceOrgId: string,
    destOrgId: string,
  ): Promise<void> {
    try {
      await this.cacheInvalidationService.invalidate(
        CACHE_PATTERNS.BRANDS_SINGLE(brandId),
        CACHE_PATTERNS.BRANDS_LIST(sourceOrgId),
        CACHE_PATTERNS.BRANDS_LIST(destOrgId),
      );
      await this.cacheInvalidationService.invalidateByTags([
        CACHE_TAGS.BRANDS,
        SCOPED_CACHE_TAGS.BRAND_CONTEXT(sourceOrgId),
        SCOPED_CACHE_TAGS.BRAND_CONTEXT(destOrgId),
      ]);
      // Members' bootstrap payload (brand list, active brand) is cached per
      // user and organization; without this both orgs show the pre-move
      // brands until the cache expires.
      await this.accessBootstrapCacheService.invalidateForOrganization(
        sourceOrgId,
      );
      await this.accessBootstrapCacheService.invalidateForOrganization(
        destOrgId,
      );
    } catch (error: unknown) {
      // The move is committed; a cache that stays stale expires on its own.
      this.logger.warn('Brand relocation cache invalidation failed', {
        brandId,
        error: error instanceof Error ? error.message : String(error),
        service: this.constructorName,
      });
    }
  }
}
