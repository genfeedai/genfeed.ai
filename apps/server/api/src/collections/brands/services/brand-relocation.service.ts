import {
  AUDITOR_IGNORED_TABLES,
  FIRST_ORDER_TARGETS,
  SECOND_ORDER_TARGETS,
} from '@api/collections/brands/constants/brand-org-cascade.constants';
import type { UpdateBrandDto } from '@api/collections/brands/dto/update-brand.dto';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/enums';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

/**
 * Minimal structural view of a Prisma model delegate, used to drive the brand→org
 * relocation cascade generically over the config in `brand-org-cascade.constants`.
 * The concrete `Prisma.TransactionClient` delegates satisfy this shape.
 */
interface CascadeDelegate {
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
  findMany(args: {
    where: Record<string, unknown>;
    select: Record<string, boolean>;
  }): Promise<{ id: string }[]>;
  count(args: { where: Record<string, unknown> }): Promise<number>;
}

// Prisma error codes used by the relocation transaction's retry/conflict handling.
// P2034 — serialization failure (SQLSTATE 40001) under Serializable isolation: the
//   transaction was aborted by a read/write conflict with a concurrent transaction.
//   Retried up to MAX_RELOCATION_SERIALIZATION_RETRIES times (mirrors
//   default-recurring-content.service.ts's ensureRecurringWorkflowForType).
// P2002 — unique constraint violation: mapped to a 409 ConflictException.
const PRISMA_SERIALIZATION_FAILURE = 'P2034';
const PRISMA_UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const MAX_RELOCATION_SERIALIZATION_RETRIES = 3;

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

export interface BrandRelocationMovingResource {
  resource: string;
  label: string;
  count: number;
}

/** Server-authoritative summary of a completed (or no-op) brand relocation. */
export interface BrandRelocationSummary {
  workflowsMoved: number;
  workflowsClonedActive: number;
  workflowsClonedPaused: number;
  membersSevered: number;
  schedulingPending: number;
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
    /** Always 0 after workflow brand ownership became one-to-one. */
    sharedWorkflows: number;
    staleMembers: number;
  };
  movingResources: BrandRelocationMovingResource[];
  /** Always null after workflow brand ownership became one-to-one. */
  ackToken: string | null;
}

const EMPTY_RELOCATION_SUMMARY: BrandRelocationSummary = {
  workflowsMoved: 0,
  workflowsClonedActive: 0,
  workflowsClonedPaused: 0,
  membersSevered: 0,
  schedulingPending: 0,
};

const RELOCATION_RESOURCE_LABELS: Record<
  string,
  { singular: string; plural: string }
> = {
  adBulkUploadJob: {
    singular: 'ad bulk upload job',
    plural: 'ad bulk upload jobs',
  },
  adCreativeMapping: {
    singular: 'ad creative mapping',
    plural: 'ad creative mappings',
  },
  adPerformance: {
    singular: 'ad performance record',
    plural: 'ad performance records',
  },
  activity: { singular: 'activity', plural: 'activities' },
  agentCampaign: { singular: 'agent campaign', plural: 'agent campaigns' },
  agentGoal: { singular: 'agent goal', plural: 'agent goals' },
  agentMemory: { singular: 'agent memory', plural: 'agent memories' },
  agentMessage: { singular: 'agent message', plural: 'agent messages' },
  agentStrategy: { singular: 'agent strategy', plural: 'agent strategies' },
  agentStrategyOpportunity: {
    singular: 'agent strategy opportunity',
    plural: 'agent strategy opportunities',
  },
  agentStrategyReport: {
    singular: 'agent strategy report',
    plural: 'agent strategy reports',
  },
  articleAnalytics: {
    singular: 'article analytics record',
    plural: 'article analytics records',
  },
  article: { singular: 'article', plural: 'articles' },
  asset: { singular: 'asset', plural: 'assets' },
  batchWorkflowJob: {
    singular: 'batch workflow job',
    plural: 'batch workflow jobs',
  },
  batch: { singular: 'batch', plural: 'batches' },
  bookmark: { singular: 'bookmark', plural: 'bookmarks' },
  botActivity: { singular: 'bot activity', plural: 'bot activities' },
  bot: { singular: 'bot', plural: 'bots' },
  brandInterview: {
    singular: 'brand interview',
    plural: 'brand interviews',
  },
  brandMemory: { singular: 'brand memory', plural: 'brand memories' },
  campaignTarget: { singular: 'campaign target', plural: 'campaign targets' },
  caption: { singular: 'caption', plural: 'captions' },
  clipProject: { singular: 'clip project', plural: 'clip projects' },
  contentPerformance: {
    singular: 'content performance record',
    plural: 'content performance records',
  },
  contentDraft: { singular: 'content draft', plural: 'content drafts' },
  contentPlan: { singular: 'content plan', plural: 'content plans' },
  contentPlanItem: {
    singular: 'content plan item',
    plural: 'content plan items',
  },
  contentRun: { singular: 'content run', plural: 'content runs' },
  contextBase: { singular: 'context base', plural: 'context bases' },
  contextEntry: { singular: 'context entry', plural: 'context entries' },
  credential: { singular: 'credential', plural: 'credentials' },
  creativePattern: {
    singular: 'creative pattern',
    plural: 'creative patterns',
  },
  distribution: { singular: 'distribution', plural: 'distributions' },
  editorProject: {
    singular: 'editor project',
    plural: 'editor projects',
  },
  folder: { singular: 'folder', plural: 'folders' },
  ingredient: { singular: 'ingredient', plural: 'ingredients' },
  lead: { singular: 'lead', plural: 'leads' },
  model: { singular: 'model', plural: 'models' },
  monitoredAccount: {
    singular: 'monitored account',
    plural: 'monitored accounts',
  },
  moodBoard: { singular: 'mood board', plural: 'mood boards' },
  newsletter: { singular: 'newsletter', plural: 'newsletters' },
  outreachCampaign: {
    singular: 'outreach campaign',
    plural: 'outreach campaigns',
  },
  persona: { singular: 'persona', plural: 'personas' },
  post: { singular: 'post', plural: 'posts' },
  postAnalytics: {
    singular: 'post analytics record',
    plural: 'post analytics records',
  },
  preset: { singular: 'preset', plural: 'presets' },
  processedTweet: {
    singular: 'processed tweet',
    plural: 'processed tweets',
  },
  prompt: { singular: 'prompt', plural: 'prompts' },
  replyBotConfig: {
    singular: 'reply bot config',
    plural: 'reply bot configs',
  },
  run: { singular: 'run', plural: 'runs' },
  schedule: { singular: 'schedule', plural: 'schedules' },
  socialConversation: {
    singular: 'social conversation',
    plural: 'social conversations',
  },
  socialMessage: { singular: 'social message', plural: 'social messages' },
  tag: { singular: 'tag', plural: 'tags' },
  task: { singular: 'task', plural: 'tasks' },
  taskComment: { singular: 'task comment', plural: 'task comments' },
  training: { singular: 'training', plural: 'trainings' },
  trackedLink: { singular: 'tracked link', plural: 'tracked links' },
  transcript: { singular: 'transcript', plural: 'transcripts' },
  trend: { singular: 'trend', plural: 'trends' },
  trendPreferences: {
    singular: 'trend preference',
    plural: 'trend preferences',
  },
  trendRemixLineage: {
    singular: 'trend remix lineage',
    plural: 'trend remix lineages',
  },
  warmupAccount: {
    singular: 'warmup account',
    plural: 'warmup accounts',
  },
  watchlist: { singular: 'watchlist', plural: 'watchlists' },
  workflowExecution: {
    singular: 'workflow execution',
    plural: 'workflow executions',
  },
  workflow: { singular: 'workflow', plural: 'workflows' },
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
  ) {}

  private static readonly RELOCATION_ELEVATED_ROLES: ReadonlySet<string> =
    new Set([MemberRole.OWNER, MemberRole.ADMIN]);

  /**
   * Brand scalar columns that may be co-updated during a relocation PATCH. Relation
   * fields (voice/music/user/organization) are intentionally excluded — they need
   * their own handling and would break a raw scalar update.
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
    'isSelected',
    'isDarkroomEnabled',
    'isDeleted',
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
      relocationAck?: string;
    },
    actingUser: { userId: string; isSuperAdmin: boolean },
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
      const updates = this.stripRelocationField(updateBrandDto);
      const patched = patchSameOrganization
        ? await patchSameOrganization(updates)
        : ((await this.prisma.brand.update({
            data: updates as Prisma.BrandUpdateInput,
            where: { id: brandId },
          })) as unknown as BrandDocument);
      return { brand: patched, summary: { ...EMPTY_RELOCATION_SUMMARY } };
    }

    const destOrg = await this.prisma.organization.findFirst({
      select: { id: true },
      where: { id: destOrgId, isDeleted: false },
    });
    if (!destOrg) {
      throw new NotFoundException('Organization', destOrgId);
    }

    await this.assertCanRelocate(actingUser, sourceOrgId, destOrgId);

    const passthrough = this.pickRelocationPassthrough(updateBrandDto);
    this.logger.log('Relocating brand between organizations', {
      brandId,
      destOrgId,
      operation: 'relocateToOrganization',
      service: this.constructorName,
      sourceOrgId,
    });

    let reconcileResult: RelocationReconcileResult = {
      membersSevered: 0,
      workflowsMoved: 0,
    };

    for (
      let attempt = 0;
      attempt < MAX_RELOCATION_SERIALIZATION_RETRIES;
      attempt += 1
    ) {
      try {
        reconcileResult = await this.prisma.$transaction(
          async (tx) => {
            const result = await this.runBrandOrgCascade(
              tx,
              brandId,
              destOrgId,
              passthrough,
            );
            await this.assertNoBrandOrgOrphans(tx, brandId, destOrgId);
            return result;
          },
          { isolationLevel: 'Serializable' },
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

        throw error;
      }
    }

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
        membersSevered: reconcileResult.membersSevered,
        schedulingPending: 0,
        workflowsClonedActive: 0,
        workflowsClonedPaused: 0,
        workflowsMoved: reconcileResult.workflowsMoved,
      },
    };
  }

  /**
   * Read-only preview for a brand relocation. Workflows are one-to-one with a
   * brand now, so they move with the brand and shared workflow clone confirmation
   * is no longer needed. `ackToken` remains for response compatibility.
   */
  async previewRelocation(
    brandId: string,
    destOrgId: string,
    actingUser: { userId: string; isSuperAdmin: boolean },
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

    return {
      ackToken: null,
      counts: {
        sharedWorkflows: 0,
        soleBrandWorkflows: impact.soleBrandWorkflowIds.length,
        staleMembers: impact.staleMemberIds.length,
      },
      movingResources,
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

    const secondOrderResources = await Promise.all(
      SECOND_ORDER_TARGETS.map(async (child) => {
        const orClauses: Record<string, unknown>[] = [];
        await Promise.all(
          child.parents.map(async (parent) => {
            const parentRows = await delegateClient[
              parent.parentDelegate
            ].findMany({
              select: { id: true },
              where: { [parent.parentBrandField]: brandId },
            });
            if (parentRows.length > 0) {
              orClauses.push({
                [parent.fkField]: { in: parentRows.map((row) => row.id) },
              });
            }
          }),
        );
        if (orClauses.length === 0) {
          return null;
        }

        const count = await delegateClient[child.delegate].count({
          where: {
            OR: orClauses,
            [child.orgField]: { not: destOrgId },
          },
        });
        return this.toMovingResource(child.delegate, count);
      }),
    );

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

  private stripRelocationField<
    T extends { organizationId?: string; relocationAck?: string },
  >(dto: T): Omit<T, 'organizationId' | 'relocationAck'> {
    // Strip BOTH the relocation trigger and its consent token: neither is a Brand
    // column, so leaking them into a normal CRUD patch (e.g. a client retry after the
    // move already committed) would make Prisma reject the update on an unknown field.
    const { organizationId: _omitOrg, relocationAck: _omitAck, ...rest } = dto;
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

  private async assertCanRelocate(
    actingUser: { userId: string; isSuperAdmin: boolean },
    sourceOrgId: string,
    destOrgId: string,
  ): Promise<void> {
    if (actingUser.isSuperAdmin) {
      return;
    }
    if (!actingUser.userId) {
      throw new ForbiddenException(
        'You are not allowed to move this brand between organizations.',
      );
    }
    const [sourceElevated, destElevated] = await Promise.all([
      this.hasElevatedMembership(actingUser.userId, sourceOrgId),
      this.hasElevatedMembership(actingUser.userId, destOrgId),
    ]);
    if (!sourceElevated || !destElevated) {
      throw new ForbiddenException(
        'Moving a brand between organizations requires an owner or admin role in both the source and destination organizations.',
      );
    }
  }

  private async hasElevatedMembership(
    userId: string,
    organizationId: string,
  ): Promise<boolean> {
    const member = await this.prisma.member.findFirst({
      select: { role: { select: { key: true } }, roleKey: true },
      where: { isActive: true, isDeleted: false, organizationId, userId },
    });
    if (!member) {
      return false;
    }
    const roleKey = member.roleKey ?? member.role?.key ?? undefined;
    return (
      roleKey !== undefined &&
      BrandRelocationService.RELOCATION_ELEVATED_ROLES.has(roleKey)
    );
  }

  /**
   * Rewrite the denormalized organization id across the brand and everything it owns.
   * Runs entirely inside the caller's transaction.
   */
  private async runBrandOrgCascade(
    tx: Prisma.TransactionClient,
    brandId: string,
    destOrgId: string,
    passthrough: Record<string, unknown>,
  ): Promise<RelocationReconcileResult> {
    const client = tx as unknown as Record<string, CascadeDelegate>;

    const impact = await this.classifyRelocationImpact(tx, brandId, destOrgId);

    // 1. The brand row itself (+ any co-patched scalar fields). The workflow
    // composite FK cascades workflow.organizationId with the brand.
    await client.brand.updateMany({
      data: { ...passthrough, organizationId: destOrgId },
      where: { id: brandId },
    });

    // 2. First-order tables: rewrite the denormalized org key.
    for (const target of FIRST_ORDER_TARGETS) {
      await client[target.delegate].updateMany({
        data: { [target.orgField]: destOrgId },
        where: {
          [target.brandField]: brandId,
          [target.orgField]: { not: destOrgId },
        },
      });
    }

    // 3. Second-order children (no brand key): follow a moved parent by scalar FK.
    for (const child of SECOND_ORDER_TARGETS) {
      const orClauses: Record<string, unknown>[] = [];
      for (const parent of child.parents) {
        const parentRows = await client[parent.parentDelegate].findMany({
          select: { id: true },
          where: { [parent.parentBrandField]: brandId },
        });
        if (parentRows.length > 0) {
          orClauses.push({
            [parent.fkField]: { in: parentRows.map((row) => row.id) },
          });
        }
      }
      if (orClauses.length === 0) {
        continue;
      }
      await client[child.delegate].updateMany({
        data: { [child.orgField]: destOrgId },
        where: { OR: orClauses, [child.orgField]: { not: destOrgId } },
      });
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
    // org-keyed execution and batch history that follows those workflows.
    if (workflowsToMove.length > 0) {
      await client.workflowExecution.updateMany({
        data: { organizationId: destOrgId },
        where: {
          workflowId: { in: workflowsToMove },
          organizationId: { not: destOrgId },
        },
      });
      await client.batchWorkflowJob.updateMany({
        data: { organizationId: destOrgId },
        where: {
          workflowId: { in: workflowsToMove },
          organizationId: { not: destOrgId },
        },
      });
    }

    // Clear per-member "last used brand" pointers left in other orgs.
    await client.member.updateMany({
      data: { lastUsedBrandId: null },
      where: { lastUsedBrandId: brandId, organizationId: { not: destOrgId } },
    });

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
   * of silently splitting tenancy.
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
         AND c1.column_name LIKE '%brand_id'
         AND (c2.column_name LIKE '%organization_id' OR c2.column_name LIKE '%org_id')`;

    const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
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
      // sql-risk-audit: ignore raw-sql-review -- table/column identifiers are regex-validated to /^[a-z_][a-z0-9_]*$/ above and injected via Prisma.raw; brandId/destOrgId are bound as parameters.
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
  }

  private async invalidateRelocationCaches(
    brandId: string,
    sourceOrgId: string,
    destOrgId: string,
  ): Promise<void> {
    await this.cacheInvalidationService.invalidate(
      CACHE_PATTERNS.BRANDS_SINGLE(brandId),
      CACHE_PATTERNS.BRANDS_LIST(sourceOrgId),
      CACHE_PATTERNS.BRANDS_LIST(destOrgId),
    );
    await this.cacheInvalidationService.invalidateByTags([CACHE_TAGS.BRANDS]);
    await this.cacheInvalidationService.invalidatePattern(
      `${CACHE_TAGS.BRANDS}:*`,
    );
  }
}
