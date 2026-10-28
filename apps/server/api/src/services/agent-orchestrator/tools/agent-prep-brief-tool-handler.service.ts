import { AgentMemoriesService } from '@api/collections/agent-memories/services/agent-memories.service';
import { AgentKnowledgeToolHandler } from '@api/services/agent-orchestrator/tools/agent-knowledge-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import {
  assemblePrepBrief,
  PREP_BRIEF_DEFAULT_WINDOW_DAYS,
  PREP_BRIEF_MAX_TOPIC_LENGTH,
  PREP_BRIEF_MAX_WINDOW_DAYS,
  type PrepBriefCoverageFamily,
  type PrepBriefInputs,
  type PrepBriefPassage,
  type PrepBriefPerformance,
} from '@api/services/agent-orchestrator/utils/agent-prep-brief.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { TargetExecutionState } from '@genfeedai/contracts';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { Injectable } from '@nestjs/common';

const KNOWLEDGE_FACT_LIMIT = 4;
const MEMORY_FACT_LIMIT = 4;
const POST_FACT_LIMIT = 4;
/** Posts that gained activity in the window, read per call. */
const PERFORMANCE_SCAN_LIMIT = 500;
const CAMPAIGN_POST_SCAN_LIMIT = 500;
const DAY_MS = 86_400_000;

function failure(error: string): AgentToolResult {
  return { creditsUsed: 0, error, success: false };
}

function readPassages(data: unknown): PrepBriefPassage[] {
  if (!isRecord(data) || !Array.isArray(data.passages)) return [];
  return data.passages.flatMap((passage): PrepBriefPassage[] => {
    if (!isRecord(passage) || !isRecord(passage.citation)) return [];
    const { sourceId, title, version, versionId } = passage.citation;
    if (
      typeof sourceId !== 'string' ||
      typeof title !== 'string' ||
      typeof version !== 'number' ||
      typeof versionId !== 'string' ||
      typeof passage.content !== 'string'
    ) {
      return [];
    }
    return [
      {
        citation: { sourceId, title, version, versionId },
        content: passage.content,
        ...(typeof passage.occurredAt === 'string'
          ? { occurredAt: passage.occurredAt }
          : {}),
      },
    ];
  });
}

function readCoverageFamilies(data: unknown): PrepBriefCoverageFamily[] {
  if (!isRecord(data) || !Array.isArray(data.families)) return [];
  return data.families.flatMap((family): PrepBriefCoverageFamily[] => {
    if (
      !isRecord(family) ||
      typeof family.family !== 'string' ||
      typeof family.state !== 'string'
    ) {
      return [];
    }
    return [
      {
        family: family.family,
        state: family.state,
        ...(typeof family.purpose === 'string'
          ? { purpose: family.purpose }
          : {}),
      },
    ];
  });
}

/**
 * `build_prep_brief`: a cited preparation brief for a brand, campaign or
 * topic. It reads Knowledge, memory, recent posts and performance with the
 * caller's own access, states only what those records support (each fact
 * carries its citation), and lists the evidence it did not find. Read only:
 * its follow-ups point at existing destinations and change nothing.
 */
@Injectable()
export class AgentPrepBriefToolHandler {
  constructor(
    private readonly knowledgeHandler: AgentKnowledgeToolHandler,
    private readonly memories: AgentMemoriesService,
    private readonly prisma: PrismaService,
  ) {}

  async buildPrepBrief(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const windowDays = params.windowDays ?? PREP_BRIEF_DEFAULT_WINDOW_DAYS;
    if (
      typeof windowDays !== 'number' ||
      !Number.isInteger(windowDays) ||
      windowDays < 1 ||
      windowDays > PREP_BRIEF_MAX_WINDOW_DAYS
    ) {
      return failure(
        `windowDays must be an integer from 1 to ${PREP_BRIEF_MAX_WINDOW_DAYS}`,
      );
    }
    const topic = readOptionalString(params.topic)?.trim() || undefined;
    if (topic && topic.length > PREP_BRIEF_MAX_TOPIC_LENGTH) {
      return failure(
        `topic must be at most ${PREP_BRIEF_MAX_TOPIC_LENGTH} characters`,
      );
    }
    const requestedBrandId = readOptionalString(params.brandId);
    if (ctx.brandId && requestedBrandId && ctx.brandId !== requestedBrandId) {
      return failure('brandId does not match this conversation');
    }
    const brandId = requestedBrandId ?? ctx.brandId;
    if (!brandId) {
      return failure(
        'Select a brand before building a brief. Pass brandId from get_brands.',
      );
    }
    const brand = await this.prisma.brand.findFirst({
      select: { id: true, label: true },
      where: scopedWhere(ctx.organizationId, { id: brandId }),
    });
    if (!brand) return failure('Brand was not found in this organization');

    const campaignId = readOptionalString(params.campaignId);
    const campaign = campaignId
      ? await this.prisma.campaign.findFirst({
          select: { id: true, name: true },
          where: scopedWhere(ctx.organizationId, { brandId, id: campaignId }),
        })
      : null;
    if (campaignId && !campaign) {
      return failure('Campaign was not found for this brand');
    }

    const now = new Date();
    const since = new Date(now.getTime() - windowDays * DAY_MS);
    const subjectText = topic ?? campaign?.name ?? brand.label;
    const scoped: ToolExecutionContext = { ...ctx, brandId };

    const [knowledge, coverage, memories, posts, performance] =
      await Promise.all([
        this.knowledgeHandler.searchKnowledge(
          { brandId, limit: KNOWLEDGE_FACT_LIMIT, query: subjectText },
          scoped,
        ),
        this.knowledgeHandler.getContextCoverage({ usage: 'context' }, scoped),
        this.memories.getMemoriesForPrompt(ctx.userId, ctx.organizationId, {
          brandId,
          ...(campaign ? { campaignId: campaign.id } : {}),
          limit: MEMORY_FACT_LIMIT * 2,
          query: subjectText,
        }),
        this.recentPosts(ctx, brandId, campaign?.id, since),
        this.readPerformance(ctx, brandId, campaign?.id, since),
      ]);

    const inputs: PrepBriefInputs = {
      brandId,
      isScanLimited: performance.isScanLimited,
      // Memories of another brand never belong in this brand's brief.
      memories: memories
        .filter((memory) => !memory.brandId || memory.brandId === brandId)
        .slice(0, MEMORY_FACT_LIMIT),
      now,
      passages: knowledge.success ? readPassages(knowledge.data) : [],
      performance: performance.totals,
      posts,
      subject: {
        ...(campaign
          ? { campaignId: campaign.id, campaignName: campaign.name }
          : {}),
        ...(topic ? { topic } : {}),
      },
      windowDays,
      ...(knowledge.success ? {} : { knowledgeError: knowledge.error }),
      ...(coverage.success
        ? { knowledgeCoverage: readCoverageFamilies(coverage.data) }
        : {}),
    };
    return {
      creditsUsed: 0,
      data: { ...assemblePrepBrief(inputs) },
      success: true,
    };
  }

  private async recentPosts(
    ctx: ToolExecutionContext,
    brandId: string,
    campaignId: string | undefined,
    since: Date,
  ) {
    return this.prisma.post.findMany({
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      select: {
        description: true,
        id: true,
        platform: true,
        publishedAt: true,
      },
      take: POST_FACT_LIMIT,
      where: scopedWhere(ctx.organizationId, {
        brandId,
        ...(campaignId ? { campaignId } : {}),
        parentId: null,
        publishedAt: { gte: since },
        targetExecutionState: TargetExecutionState.PUBLISHED,
      }),
    });
  }

  /**
   * Daily snapshots carry the day's increment, so the sum over the window is
   * what the posts gained in it, whatever day they were published.
   */
  private async readPerformance(
    ctx: ToolExecutionContext,
    brandId: string,
    campaignId: string | undefined,
    since: Date,
  ): Promise<{ isScanLimited: boolean; totals: PrepBriefPerformance | null }> {
    let postIds: string[] | undefined;
    if (campaignId) {
      const campaignPosts = await this.prisma.post.findMany({
        select: { id: true },
        take: CAMPAIGN_POST_SCAN_LIMIT,
        where: scopedWhere(ctx.organizationId, { brandId, campaignId }),
      });
      postIds = campaignPosts.map((post) => post.id);
      if (postIds.length === 0) return { isScanLimited: false, totals: null };
    }
    const groups = await this.prisma.postAnalytics.groupBy({
      _sum: {
        totalCommentsIncrement: true,
        totalLikesIncrement: true,
        totalSharesIncrement: true,
        totalViewsIncrement: true,
      },
      by: ['postId'],
      orderBy: { _sum: { totalViewsIncrement: 'desc' } },
      take: PERFORMANCE_SCAN_LIMIT,
      where: scopedWhere(ctx.organizationId, {
        brandId,
        date: { gte: since },
        ...(postIds ? { postId: { in: postIds } } : {}),
      }),
    });
    const sum = (pick: (group: (typeof groups)[number]) => number | null) =>
      groups.reduce((total, group) => total + (pick(group) ?? 0), 0);
    const totals: PrepBriefPerformance = {
      comments: sum((group) => group._sum.totalCommentsIncrement),
      likes: sum((group) => group._sum.totalLikesIncrement),
      postCount: groups.length,
      shares: sum((group) => group._sum.totalSharesIncrement),
      topPostIds: groups.slice(0, 5).map((group) => group.postId),
      views: sum((group) => group._sum.totalViewsIncrement),
    };
    return {
      isScanLimited: groups.length >= PERFORMANCE_SCAN_LIMIT,
      totals: groups.length === 0 ? null : totals,
    };
  }
}
