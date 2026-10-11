import {
  AUDITOR_IGNORED_TABLES,
  FIRST_ORDER_TARGETS,
  SECOND_ORDER_TARGETS,
} from '@api/collections/brands/constants/brand-org-cascade.constants';
import { RELOCATION_RESOURCE_LABELS } from '@api/collections/brands/constants/brand-relocation-labels.constant';
import type { UpdateBrandDto } from '@api/collections/brands/dto/update-brand.dto';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import {
  lockBrandLearningMutation,
  patchBrandWithLearningFenced,
} from '@api/collections/brands/services/brand-learning-mutation.util';
import {
  assertNoOrgOnlyChildOrphans,
  type CascadeDelegate,
  resolveSecondOrderFilters,
  type SecondOrderParentIds,
} from '@api/collections/brands/utils/brand-relocation-cascade.util';
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
  type BrandRelocationHeldSchedule,
  findActiveBrandSchedules,
  holdBrandSchedules,
} from '@api/collections/brands/utils/brand-relocation-schedules.util';
import { invalidateLearningDependencySource } from '@api/collections/content-learning/services/learning-dependency.service';
import { revokePersonaGrantsForRelocation } from '@api/collections/personas/utils/persona-grant-revocation.util';
import type { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { resolveApiKeyEffectiveMemberRole } from '@api/helpers/utils/auth/api-key-role.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { hasExplicitApiKeyAdminScope, MemberRole } from '@genfeedai/contracts';
import { BRAND_HANDLE_TAKEN_MESSAGE } from '@genfeedai/contracts/constants';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

// Prisma error codes used by the relocation transaction's retry/conflict handling.
// P2034 — serialization failure (SQLSTATE 40001) under Serializable isolation: the
//   transaction was aborted by a read/write conflict with a concurrent transaction.
//   Retried up to MAX_RELOCATION_SERIALIZATION_RETRIES times (mirrors
//   default-recurring-content.service.ts's ensureRecurringWorkflowForType).
// P2002 — unique constraint violation: mapped to a 409 ConflictException.
// P2028 — transaction API error: the interactive transaction expired or could not
//   start in time. Nothing was moved; mapped to a retryable 503.
const PRISMA_SERIALIZATION_FAILURE = 'P2034';
const PRISMA_UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const PRISMA_TRANSACTION_API_ERROR = 'P2028';
// P2003 — foreign key violation. The composite organization keys are deferred
//   for the move and checked at commit; a violation means a row still names a
//   parent that stayed behind, so the whole move is rolled back.
const PRISMA_FOREIGN_KEY_VIOLATION = 'P2003';
const MAX_RELOCATION_SERIALIZATION_RETRIES = 3;
// The default interactive-transaction timeout is 5 seconds. A relocation rewrites
// every row the brand owns, so a large brand needs far longer.
const RELOCATION_TRANSACTION_TIMEOUT_MS = 120_000;
const RELOCATION_TRANSACTION_MAX_WAIT_MS = 10_000;
// A database trigger refused the cascade: the row is immutable or append-only.
// The guards refuse these brands first; this maps any that slip past them.
const IMMUTABLE_ROW_PATTERN = /immutable|append-only|cannot be rebound/i;

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
  touchedWorkflowIds: string[];
}

export interface BrandRelocationMovingResource {
  resource: string;
  label: string;
  count: number;
}

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
  };
  movingResources: BrandRelocationMovingResource[];
  /** The enabled schedules that will be paused. */
  schedulesToHold: BrandRelocationHeldSchedule[];
}

const EMPTY_RELOCATION_SUMMARY: BrandRelocationSummary = {
  membersSevered: 0,
  personaGrantsRevoked: 0,
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
  async relocateToOrganization(
    brandId: string,
    updateBrandDto: Partial<UpdateBrandDto> & {
      organizationId?: string;
    },
    actingUser: BrandRelocationActingUser,
    patchSameOrganization?: BrandSameOrganizationPatch,
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

    // An org always keeps at least one non-deleted brand (#5219): the source org
    // must have another brand left for its members' currentBrandId to fall back
    // to once this one moves out.
    const sourceFallbackBrand = await this.prisma.brand.findFirst({
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
          async (tx) => {
            // A child row can name several parents by composite organization
            // keys (an observation: brand, credential and post). Whichever the
            // cascade updates first, the others have not followed yet, so the
            // checks wait for commit, when every parent and child agree.
            await tx.$executeRaw`SET CONSTRAINTS ALL DEFERRED`;
            await this.prepareLearningRelocation(
              tx,
              brandId,
              sourceOrgId,
              destOrgId,
              actingUser,
              updateBrandDto.slug,
            );
            // Before the cascade rewrites any organization id: the schedule
            // actors and the persona grants both belong to the source tenant.
            const { held, touchedWorkflowIds } = await holdBrandSchedules(
              tx,
              brandId,
            );
            const personaGrantsRevoked = await revokePersonaGrantsForRelocation(
              tx,
              {
                actorUserId: actingUser.userId,
                brandId,
                organizationId: sourceOrgId,
              },
            );
            const result = await this.runBrandOrgCascade(
              tx,
              brandId,
              sourceOrgId,
              destOrgId,
              passthrough,
            );
            await this.assertNoBrandOrgOrphans(tx, brandId, destOrgId);
            return {
              ...result,
              heldSchedules: held,
              personaGrantsRevoked,
              touchedWorkflowIds,
            };
          },
          {
            isolationLevel: 'Serializable',
            maxWait: RELOCATION_TRANSACTION_MAX_WAIT_MS,
            timeout: RELOCATION_TRANSACTION_TIMEOUT_MS,
          },
        );
        break;
      } catch (error: unknown) {
        const errorCode = (error as { code?: string }).code;

        if (errorCode === PRISMA_UNIQUE_CONSTRAINT_VIOLATION) {
          const uniqueTarget = (error as Prisma.PrismaClientKnownRequestError)
            .meta?.target;
          const target = Array.isArray(uniqueTarget)
            ? uniqueTarget.join(', ')
            : 'a unique constraint';
          throw new ConflictException(
            `Cannot move brand: a record in the destination organization already conflicts on ${target}.`,
          );
        }

        if (errorCode === PRISMA_FOREIGN_KEY_VIOLATION) {
          this.logger.error('Brand relocation left a stale reference', error, {
            brandId,
            destOrgId,
            sourceOrgId,
          });
          throw new ConflictException(
            'Cannot move this brand: a record that belongs to it still references the previous organization, so nothing was moved.',
          );
        }

        if (errorCode === PRISMA_TRANSACTION_API_ERROR) {
          this.logger.error('Brand relocation transaction timed out', error, {
            brandId,
            destOrgId,
            sourceOrgId,
          });
          throw new ServiceUnavailableException(
            'Moving this brand took too long and was rolled back; nothing moved. Try again, or move it when less work is running.',
          );
        }

        if (
          errorCode === PRISMA_SERIALIZATION_FAILURE &&
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

        if (
          error instanceof Error &&
          !(error instanceof HttpException) &&
          IMMUTABLE_ROW_PATTERN.test(error.message)
        ) {
          throw new ConflictException(
            'Cannot move this brand: it owns a record that is immutable or append-only and must stay in its original organization.',
          );
        }

        throw error;
      }
    }

    // The move is committed. Nothing below may fail it: a queued job that
    // outlives the pause is harmless (the scheduler drops a fire for a paused
    // workflow), and a cache that stays stale expires.
    const schedulingPending = await this.unscheduleHeldWorkflows(
      moveResult.touchedWorkflowIds,
    );
    await this.invalidateRelocationCaches(brandId, sourceOrgId, destOrgId);

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
        schedulesHeld: moveResult.heldSchedules.length,
        schedulingPending,
        workflowsMoved: moveResult.workflowsMoved,
      },
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
    const movingResources = await this.countRelocationMovingResources(
      this.prisma as unknown as Prisma.TransactionClient,
      brandId,
      destOrgId,
    );

    const schedulesToHold = await findActiveBrandSchedules(
      this.prisma as unknown as Prisma.TransactionClient,
      brandId,
    );

    return {
      counts: {
        schedulesToHold: schedulesToHold.length,
        soleBrandWorkflows: impact.soleBrandWorkflowIds.length,
        staleMembers: impact.staleMemberIds.length,
      },
      movingResources,
      schedulesToHold,
    };
  }

  private async countRelocationMovingResources(
    client: Prisma.TransactionClient,
    brandId: string,
    destOrgId: string,
  ): Promise<BrandRelocationMovingResource[]> {
    const delegateClient = client as unknown as Record<string, CascadeDelegate>;
    const firstOrderResources = await Promise.all(
      FIRST_ORDER_TARGETS.map(async (target) => {
        const count = await delegateClient[target.delegate].count({
          where: {
            [target.brandField]: brandId,
            [target.orgField]: { not: destOrgId },
          },
        });
        return this.toMovingResource(target.delegate, count);
      }),
    );

    const secondOrderResources: (BrandRelocationMovingResource | null)[] = [];
    const parentIds: SecondOrderParentIds = new Map();
    for (const child of SECOND_ORDER_TARGETS) {
      const groups = await resolveSecondOrderFilters(
        delegateClient,
        child,
        brandId,
        parentIds,
      );
      // A child that points at several parents is counted once: each parent's
      // rows exclude the rows an earlier parent already claimed.
      const claimed: Record<string, unknown>[] = [];
      let count = 0;
      for (const filters of groups) {
        for (const filter of filters) {
          count += await delegateClient[child.delegate].count({
            where: {
              ...filter,
              [child.orgField]: { not: destOrgId },
              ...(claimed.length > 0 ? { NOT: { OR: claimed } } : {}),
            },
          });
        }
        claimed.push(...filters);
      }
      secondOrderResources.push(this.toMovingResource(child.delegate, count));
    }

    return [...firstOrderResources, ...secondOrderResources].filter(
      (resource): resource is BrandRelocationMovingResource =>
        resource !== null,
    );
  }

  private toMovingResource(
    resource: string,
    count: number,
  ): BrandRelocationMovingResource | null {
    if (count <= 0) {
      return null;
    }
    return {
      count,
      label: this.formatRelocationResourceLabel(resource, count),
      resource,
    };
  }

  private formatRelocationResourceLabel(
    resource: string,
    count: number,
  ): string {
    const labels = RELOCATION_RESOURCE_LABELS[resource];
    if (labels) {
      return count === 1 ? labels.singular : labels.plural;
    }

    const words = resource.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    return `${words} ${count === 1 ? 'record' : 'records'}`;
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

  private async assertCanRelocate(
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
      select: { role: { select: { key: true } }, roleKey: true },
      where: scopedWhere(organizationId, {
        isActive: true,
        userId: actingUser.userId,
      }),
    });
    if (!member) {
      return false;
    }
    const roleKey = member.roleKey ?? member.role?.key ?? undefined;
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

  /**
   * Safety net: after the cascade, assert no brand-owned row still points at a stale
   * org. Part A verifies every configured table (correct field pairing). Part B
   * discovers ANY other dual-keyed table via information_schema and blocks the move
   * if it would orphan rows — so a forgotten/future table rolls back loudly instead
   * of silently splitting tenancy. Part C does the same for org-only children, which
   * carry an organization column and a foreign key to a moved parent but no brand
   * column: the configured ones are re-counted, and any other is found in the
   * catalog.
   */
  private async assertNoBrandOrgOrphans(
    tx: Prisma.TransactionClient,
    brandId: string,
    destOrgId: string,
  ): Promise<void> {
    const client = tx as unknown as Record<string, CascadeDelegate>;

    const stale: string[] = [];
    for (const target of FIRST_ORDER_TARGETS) {
      const remaining = await client[target.delegate].count({
        where: {
          [target.brandField]: brandId,
          [target.orgField]: { not: destOrgId },
        },
      });
      if (remaining > 0) {
        stale.push(`${target.delegate} (${remaining})`);
      }
    }
    if (stale.length > 0) {
      throw new InternalServerErrorException(
        `Brand relocation aborted: cascade left stale organization id on ${stale.join(', ')}.`,
      );
    }

    const knownTables = new Set<string>([
      ...FIRST_ORDER_TARGETS.map((target) => target.table),
      ...SECOND_ORDER_TARGETS.map((target) => target.table),
      ...AUDITOR_IGNORED_TABLES,
    ]);

    // sql-risk-audit: ignore raw-sql-review -- static information_schema introspection, no caller input interpolated.
    const candidates = await tx.$queryRaw<
      { table_name: string; brand_col: string; org_col: string }[]
    >`SELECT c1.table_name AS table_name, c1.column_name AS brand_col, c2.column_name AS org_col
       FROM information_schema.columns c1
       JOIN information_schema.columns c2
         ON c1.table_name = c2.table_name AND c1.table_schema = c2.table_schema
       WHERE c1.table_schema = 'public'
         AND c1.column_name ~* 'brand_?id$'
         AND c2.column_name ~* '(organization|org)_?id$'`;

    // Columns are camelCase (`brandId`, `organizationId`), so the identifiers are
    // quoted below and may carry capitals.
    const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
    const unhandled: string[] = [];
    for (const candidate of candidates) {
      if (knownTables.has(candidate.table_name)) {
        continue;
      }
      if (
        !IDENTIFIER.test(candidate.table_name) ||
        !IDENTIFIER.test(candidate.brand_col) ||
        !IDENTIFIER.test(candidate.org_col)
      ) {
        continue;
      }
      // sql-risk-audit: ignore raw-sql-review -- table/column identifiers are regex-validated to /^[A-Za-z_][A-Za-z0-9_]*$/ above and injected via Prisma.raw; brandId/destOrgId are bound as parameters.
      const rows = await tx.$queryRaw<
        { n: number }[]
      >`SELECT COUNT(*)::int AS n FROM ${Prisma.raw(`"${candidate.table_name}"`)} WHERE ${Prisma.raw(`"${candidate.brand_col}"`)} = ${brandId} AND ${Prisma.raw(`"${candidate.org_col}"`)} IS DISTINCT FROM ${destOrgId}`;
      const count = rows[0]?.n ?? 0;
      if (count > 0) {
        unhandled.push(
          `${candidate.table_name}.${candidate.brand_col}/${candidate.org_col} (${count})`,
        );
      }
    }
    if (unhandled.length > 0) {
      throw new InternalServerErrorException(
        `Brand relocation aborted: unhandled dual-keyed table(s) would be orphaned in the source org: ${unhandled.join(', ')}. Add them to FIRST_ORDER_TARGETS in brand-org-cascade.constants.ts.`,
      );
    }

    // Part C: org-only children (an organization column and a foreign key to a
    // moved parent, no brand column) must follow their parent too.
    await assertNoOrgOnlyChildOrphans(tx, brandId, destOrgId);
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
      await this.cacheInvalidationService.invalidateByTags([CACHE_TAGS.BRANDS]);
    } catch (error: unknown) {
      // The move is committed; a cache that stays stale expires on its own.
      this.logger.warn('Brand relocation cache invalidation failed', {
        brandId,
        error: error instanceof Error ? error.message : String(error),
        service: this.constructorName,
      });
    }
  }

  /**
   * Remove the queued scheduler job for every workflow the move paused. Runs
   * after commit and never fails the move: a job that outlives the pause is
   * dropped when it fires, because the workflow no longer has an enabled
   * schedule. Returns how many jobs could not be confirmed removed.
   */
  private async unscheduleHeldWorkflows(
    workflowIds: readonly string[],
  ): Promise<number> {
    if (workflowIds.length === 0) {
      return 0;
    }
    const scheduler = await this.resolveWorkflowSchedulerService();
    if (!scheduler) {
      this.logger.warn(
        'Workflow scheduler unavailable; queued jobs of paused schedules will be dropped when they fire',
        { service: this.constructorName, workflowCount: workflowIds.length },
      );
      return workflowIds.length;
    }
    let pending = 0;
    for (const workflowId of workflowIds) {
      try {
        await scheduler.unscheduleWorkflow(workflowId);
      } catch (error: unknown) {
        pending += 1;
        this.logger.warn('Failed to unschedule a workflow after relocation', {
          error: error instanceof Error ? error.message : String(error),
          service: this.constructorName,
          workflowId,
        });
      }
    }
    return pending;
  }

  private async resolveWorkflowSchedulerService(): Promise<WorkflowSchedulerService | null> {
    if (!this.moduleRef) {
      return null;
    }
    try {
      // Deferred import: a top-level value import of the scheduler closes the
      // brands -> workflows -> brands module cycle and crashes API bootstrap
      // (the same reason DefaultRecurringContentService resolves it lazily).
      const { WorkflowSchedulerService: schedulerServiceClass } = await import(
        '@api/collections/workflows/services/workflow-scheduler.service'
      );
      return this.moduleRef.get(schedulerServiceClass, { strict: false });
    } catch {
      return null;
    }
  }
}
