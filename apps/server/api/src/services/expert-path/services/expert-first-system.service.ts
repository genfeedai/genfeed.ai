import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import type { ContentPlanItemDocument } from '@api/collections/content-plan-items/schemas/content-plan-item.schema';
import { ContentPlanItemsService } from '@api/collections/content-plan-items/services/content-plan-items.service';
import type { ContentPlanDocument } from '@api/collections/content-plans/schemas/content-plan.schema';
import { ContentPlansService } from '@api/collections/content-plans/services/content-plans.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { AUTOMATION_WORKFLOW_IDS } from '@api/collections/workflows/services/automation-workflow-definitions';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { InsufficientCreditsException } from '@api/exceptions/business-logic.exception';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { ContentPlannerService } from '@api/services/content-engine/content-planner.service';
import { ExpertCorpusService } from '@api/services/expert-path/services/expert-corpus.service';
import { formatHarnessBrief } from '@api/services/harness/harness-brief.util';
import { collectKnowledgeReceipts } from '@api/services/harness/harness-context-sources.util';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  ContentPlanItemStatus,
  fromPrismaCredentialPlatform,
  KnowledgeSourcePurpose,
  WorkflowExecutionTrigger,
} from '@genfeedai/contracts';
import {
  EXPERT_FIRST_SYSTEM_CREDIT_COST,
  EXPERT_FIRST_SYSTEM_ITEM_COUNT,
  EXPERT_FIRST_SYSTEM_MEMORY_TYPE,
  EXPERT_FIRST_SYSTEM_PLAN_SOURCE,
} from '@genfeedai/contracts/constants';
import type {
  ExpertFirstSystemItemAction,
  ExpertFirstSystemStatus,
  IContentPlanProvenance,
  IExpertFirstSystemReadiness,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

const FIRST_SYSTEM_PERIOD_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ExpertFirstSystemResult {
  items: ContentPlanItemDocument[];
  plan: ContentPlanDocument;
  provenance: IContentPlanProvenance;
}

export interface ExpertFirstSystemRecord {
  error?: string;
  planId?: string;
  status: ExpertFirstSystemStatus;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function readFirstSystemStatus(value: unknown): ExpertFirstSystemStatus {
  return value === 'generated' || value === 'failed' ? value : 'none';
}

/**
 * Expert Path `first-system`: a reviewable first content plan built from the
 * harness brief (identity from the positioning profile, knowledge from the
 * authoritative corpus), with the profile id and source receipts recorded on
 * the plan. Approved items run through the plan-item workflow, which lands
 * each post in the review queue — nothing publishes without approval.
 */
@Injectable()
export class ExpertFirstSystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandMemoryService: BrandMemoryService,
    private readonly contentPlanItemsService: ContentPlanItemsService,
    private readonly contentPlannerService: ContentPlannerService,
    private readonly contentPlansService: ContentPlansService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly expertCorpusService: ExpertCorpusService,
    private readonly harnessGenerationService: HarnessGenerationService,
    private readonly harnessProfilesService: HarnessProfilesService,
    private readonly logger: LoggerService,
    private readonly moduleRef: ModuleRef,
  ) {}

  // WorkflowsModule already imports the content-engine graph, so resolve the
  // runner lazily instead of creating a module cycle (as ContentEngineController does).
  private get systemWorkflowRunner(): SystemWorkflowRunnerService {
    return this.moduleRef.get(SystemWorkflowRunnerService, { strict: false });
  }

  async getReadiness(
    organizationId: string,
    brandId: string,
  ): Promise<IExpertFirstSystemReadiness> {
    const [profile, corpus, platforms] = await Promise.all([
      this.harnessProfilesService.getActiveForBrand(organizationId, brandId),
      this.expertCorpusService.summarize(organizationId, brandId),
      this.resolvePlatforms(organizationId, brandId),
    ]);

    const missing: IExpertFirstSystemReadiness['missing'] = [];
    if (!profile?.positioning) {
      missing.push('positioning');
    }
    if (corpus.readySourceIds.length === 0) {
      missing.push('corpus');
    }

    return {
      creditCost: EXPERT_FIRST_SYSTEM_CREDIT_COST,
      isReady: missing.length === 0,
      isUsingInterviewPlatforms: platforms.isUsingInterviewPlatforms,
      missing,
      platforms: platforms.platforms,
    };
  }

  async readRecord(
    organizationId: string,
    brandId: string,
  ): Promise<ExpertFirstSystemRecord> {
    const [entry] = await this.brandMemoryService.listTypedEntries(
      organizationId,
      brandId,
      EXPERT_FIRST_SYSTEM_MEMORY_TYPE,
    );
    const metadata = readRecord(entry?.metadata);
    const planId =
      typeof metadata.planId === 'string' ? metadata.planId : undefined;
    const error =
      typeof metadata.error === 'string' ? metadata.error : undefined;

    return {
      status: readFirstSystemStatus(metadata.status),
      ...(planId ? { planId } : {}),
      ...(error ? { error } : {}),
    };
  }

  /** The plan recorded by the latest successful first-system generation. */
  async getCurrentPlan(
    organizationId: string,
    brandId: string,
  ): Promise<{
    items: ContentPlanItemDocument[];
    plan: ContentPlanDocument;
  } | null> {
    const record = await this.readRecord(organizationId, brandId);
    if (!record.planId) {
      return null;
    }

    try {
      const plan = await this.contentPlansService.getByIdOrFail(
        organizationId,
        record.planId,
        brandId,
      );
      const items = await this.contentPlanItemsService.listByPlan(
        organizationId,
        record.planId,
      );
      return { items, plan };
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        return null;
      }
      throw error;
    }
  }

  async generate(params: {
    brandId: string;
    organizationId: string;
    userId: string;
  }): Promise<ExpertFirstSystemResult> {
    const { brandId, organizationId, userId } = params;
    const readiness = await this.getReadiness(organizationId, brandId);
    if (!readiness.isReady) {
      throw new BadRequestException({
        detail: `The first content system needs: ${readiness.missing.join(', ')}.`,
        missing: readiness.missing,
        title: 'Expert Path not ready',
      });
    }

    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organizationId,
        EXPERT_FIRST_SYSTEM_CREDIT_COST,
      );
    if (!hasCredits) {
      const balance =
        await this.creditsUtilsService.getOrganizationCreditsBalance(
          organizationId,
        );
      throw new InsufficientCreditsException(
        EXPERT_FIRST_SYSTEM_CREDIT_COST,
        balance,
      );
    }

    try {
      const result = await this.buildPlan(params, readiness);

      // Charge only for a plan that exists; a failed generation costs nothing.
      await this.creditsUtilsService.deductCreditsFromOrganization(
        organizationId,
        userId,
        EXPERT_FIRST_SYSTEM_CREDIT_COST,
        'Expert Path first content system',
        ActivitySource.EXPERT_FIRST_SYSTEM,
      );
      await this.writeRecord(organizationId, brandId, {
        planId: String(result.plan.id),
        status: 'generated',
      });

      return result;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'First system failed';
      this.logger.error('Expert first content system generation failed', {
        brandId,
        error: message,
        organizationId,
      });
      await this.writeRecord(organizationId, brandId, {
        error: message,
        status: 'failed',
      });
      throw error;
    }
  }

  async applyItemAction(params: {
    action: ExpertFirstSystemItemAction;
    brandId: string;
    itemId: string;
    organizationId: string;
    planId: string;
    prompt?: string;
    topic?: string;
    userId: string;
  }): Promise<{ item: ContentPlanItemDocument }> {
    const { organizationId } = params;
    const plan = await this.contentPlansService.getByIdOrFail(
      organizationId,
      params.planId,
      params.brandId,
    );
    const provenance = readRecord(plan.provenance);
    if (provenance.source !== EXPERT_FIRST_SYSTEM_PLAN_SOURCE) {
      throw new BadRequestException(
        'Only the Expert Path first content system is reviewed here.',
      );
    }

    const item = await this.contentPlanItemsService.getByIdOrFail(
      organizationId,
      params.itemId,
    );
    if (String(item.planId) !== String(plan.id)) {
      throw new NotFoundException('ContentPlanItem', params.itemId);
    }
    if (item.status !== ContentPlanItemStatus.PENDING) {
      throw new BadRequestException(
        `Item is already ${item.status}; only pending items can be reviewed.`,
      );
    }

    const hasEdits = params.topic !== undefined || params.prompt !== undefined;
    if (params.action === 'edit' && !hasEdits) {
      throw new BadRequestException('Provide a topic or prompt to edit.');
    }
    const edited = hasEdits
      ? await this.contentPlanItemsService.updateContent(
          organizationId,
          params.itemId,
          {
            ...(params.prompt !== undefined ? { prompt: params.prompt } : {}),
            ...(params.topic !== undefined ? { topic: params.topic } : {}),
          },
        )
      : item;

    if (params.action === 'edit') {
      return { item: edited };
    }

    if (params.action === 'reject') {
      return {
        item: await this.contentPlanItemsService.updateStatus(
          organizationId,
          params.itemId,
          ContentPlanItemStatus.SKIPPED,
        ),
      };
    }

    await this.systemWorkflowRunner.runWorkflow<Record<string, unknown>>({
      actionType: AUTOMATION_WORKFLOW_IDS.CONTENT_ENGINE_ITEM,
      canonicalId: AUTOMATION_WORKFLOW_IDS.CONTENT_ENGINE_ITEM,
      inputValues: {
        brandId: params.brandId,
        item: { id: params.itemId },
        userId: params.userId,
      },
      organizationId,
      source: 'api:expert-path.first-system.approve-item',
      trigger: WorkflowExecutionTrigger.API,
      userId: params.userId,
    });

    return {
      item: await this.contentPlanItemsService.getByIdOrFail(
        organizationId,
        params.itemId,
      ),
    };
  }

  private async buildPlan(
    params: { brandId: string; organizationId: string; userId: string },
    readiness: IExpertFirstSystemReadiness,
  ): Promise<ExpertFirstSystemResult> {
    const { brandId, organizationId, userId } = params;
    const [profile, corpus] = await Promise.all([
      this.harnessProfilesService.getActiveForBrand(organizationId, brandId),
      this.expertCorpusService.summarize(organizationId, brandId),
    ]);
    const topic =
      profile?.thesis?.bigDomino?.[0] ??
      profile?.thesis?.transformation?.[0] ??
      profile?.label;

    const brief = await this.harnessGenerationService.resolveBrief({
      brandId,
      contentType: 'post',
      includeContentMemory: true,
      knowledgeSelection: { purposes: [KnowledgeSourcePurpose.BRAND_TRUTH] },
      objective: 'engagement',
      organizationId,
      ...(topic ? { topic } : {}),
    });
    if (!brief) {
      throw new Error('The harness brief for this brand is unavailable.');
    }

    const now = Date.now();
    const { items, plan } = await this.contentPlannerService.generatePlan(
      organizationId,
      brandId,
      userId,
      {
        additionalInstructions: [
          'This is the expert’s first content system. Every item must express the expert’s own positioning and draw on their corpus (the BRAND FACTS below); never invent credentials, results, or clients.',
          formatHarnessBrief(brief),
        ].join('\n\n'),
        itemCount: EXPERT_FIRST_SYSTEM_ITEM_COUNT,
        name: 'First content system',
        periodEnd: new Date(
          now + FIRST_SYSTEM_PERIOD_DAYS * DAY_MS,
        ).toISOString(),
        periodStart: new Date(now).toISOString(),
        platforms: readiness.platforms,
      },
    );

    const provenance: IContentPlanProvenance = {
      connectToSchedulePlatforms: readiness.isUsingInterviewPlatforms
        ? readiness.platforms
        : [],
      corpusSourceIds: corpus.readySourceIds,
      knowledgeReceipts: collectKnowledgeReceipts(brief.sources),
      source: EXPERT_FIRST_SYSTEM_PLAN_SOURCE,
      ...(brief.receipts?.harnessProfileId
        ? { harnessProfileId: brief.receipts.harnessProfileId }
        : {}),
      ...(brief.receipts?.brandOs === 'approved'
        ? { brandOsRevisionId: brief.receipts.brandOsRevisionId }
        : {}),
    };

    const recorded = await this.contentPlansService.recordProvenance(
      organizationId,
      String(plan.id),
      provenance,
    );

    return { items, plan: recorded, provenance };
  }

  /**
   * Connected credentials win; with none connected the plan uses the
   * platforms named in the interview and marks them "connect to schedule".
   */
  private async resolvePlatforms(
    organizationId: string,
    brandId: string,
  ): Promise<{ isUsingInterviewPlatforms: boolean; platforms: string[] }> {
    const credentials = await this.prisma.credential.findMany({
      select: { platform: true },
      where: scopedWhere(organizationId, { brandId, isConnected: true }),
    });
    const connected = Array.from(
      new Set(
        credentials
          .map((credential) =>
            fromPrismaCredentialPlatform(credential.platform),
          )
          .filter((platform): platform is NonNullable<typeof platform> =>
            Boolean(platform),
          )
          .map((platform) => String(platform)),
      ),
    );
    if (connected.length > 0) {
      return { isUsingInterviewPlatforms: false, platforms: connected };
    }

    const brand = await this.prisma.brand.findFirst({
      select: { agentConfig: true },
      where: scopedWhere(organizationId, { id: brandId }),
    });
    const strategy = readRecord(readRecord(brand?.agentConfig).strategy);
    return {
      isUsingInterviewPlatforms: true,
      platforms: readStringList(strategy.platforms),
    };
  }

  private async writeRecord(
    organizationId: string,
    brandId: string,
    record: ExpertFirstSystemRecord,
  ): Promise<void> {
    await this.brandMemoryService.upsertTypedEntry(organizationId, brandId, {
      content: record.status,
      metadata: {
        ...record,
        recordedAt: new Date().toISOString(),
      },
      type: EXPERT_FIRST_SYSTEM_MEMORY_TYPE,
    });
  }
}
