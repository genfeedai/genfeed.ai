import { computeNextRunAtOrThrow } from '@api/collections/cron-jobs/services/cron-jobs.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowGenerationService } from '@api/collections/workflows/services/workflow-generation.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { MarketplaceApiClient } from '@api/marketplace-integration/marketplace-api-client';
import { MarketplaceInstallService } from '@api/marketplace-integration/marketplace-install.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentToolInternalApiService } from '@api/services/agent-orchestrator/tools/agent-tool-internal-api.service';
import {
  readOptionalNumber,
  readOptionalString,
} from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import { WorkflowExecutionTrigger, WorkflowTrigger } from '@genfeedai/enums';
import type { AgentToolResult } from '@genfeedai/interfaces';
import { AgentToolName, toAgentScopeMetadata } from '@genfeedai/interfaces';
import { formatRecurringSchedule } from '@helpers/formatting/recurring-schedule/recurring-schedule.helper';
import { ConfigService } from '@libs/config/config.service';
import { Inject, Injectable, Optional } from '@nestjs/common';

type OfficialWorkflowSourceKind =
  | 'generated'
  | 'marketplace-listing'
  | 'seeded-template';
interface OfficialWorkflowSource {
  id: string;
  kind: OfficialWorkflowSourceKind;
  name: string;
  description?: string;
  confidence: number;
  slug?: string;
  price?: number;
  pricingTier?: string;
}
type RecurringTaskContentType = 'image' | 'video' | 'post' | 'newsletter';

interface AgentBrandsServiceLike {
  findOne: (
    params: Record<string, unknown>,
    context?: string,
  ) => Promise<Record<string, unknown> | null>;
}

/**
 * Workflow tools extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentWorkflowToolHandler {
  constructor(
    private readonly configService: ConfigService,
    private readonly workflowsService: WorkflowsService,
    private readonly workflowExecutorService: WorkflowExecutorService,
    private readonly internalApi: AgentToolInternalApiService,
    @Inject('AGENT_BRANDS_SERVICE')
    private readonly brandsService: AgentBrandsServiceLike,
    @Optional()
    private readonly workflowGenerationService?: WorkflowGenerationService,
    @Optional()
    private readonly marketplaceApiClient?: MarketplaceApiClient,
    @Optional()
    private readonly marketplaceInstallService?: MarketplaceInstallService,
  ) {}
  private buildImageVariationPrompt(
    prompt: string,
    index: number,
    count: number,
    diversityMode: 'low' | 'medium' | 'high',
    styleNotes?: string,
    negativePrompt?: string,
  ): string {
    const variationHints: Record<typeof diversityMode, string> = {
      high: 'Push the concept into a clearly distinct visual take while preserving the same campaign goal.',
      low: 'Keep the concept tightly consistent with the base direction and vary only small creative details.',
      medium:
        'Vary composition, subject emphasis, and framing while staying within the same campaign direction.',
    };

    const parts = [
      prompt.trim(),
      `Create variation ${index} of ${count}.`,
      variationHints[diversityMode],
    ];

    if (styleNotes?.trim()) {
      parts.push(`Style notes: ${styleNotes.trim()}`);
    }

    if (negativePrompt?.trim()) {
      parts.push(`Avoid: ${negativePrompt.trim()}`);
    }

    return parts.join(' ');
  }

  private buildMarketplaceListingUrl(slug?: string): string | null {
    if (!slug) {
      return null;
    }

    const appUrl =
      this.configService.get('GENFEEDAI_APP_URL') || 'https://app.genfeed.ai';
    return `${appUrl.replace('app.', 'marketplace.')}/${slug}`;
  }

  private tokenizeWorkflowBootstrapText(...values: Array<unknown>): string[] {
    return values
      .flatMap((value) =>
        String(value || '')
          .toLowerCase()
          .split(/[^a-z0-9]+/g),
      )
      .map((token) => token.trim())
      .filter((token) => token.length >= 3);
  }

  private inferBootstrapContentType(
    params: Record<string, unknown>,
  ): RecurringTaskContentType {
    const explicitType =
      typeof params.contentType === 'string'
        ? params.contentType.toLowerCase()
        : null;

    if (
      explicitType === 'image' ||
      explicitType === 'video' ||
      explicitType === 'post' ||
      explicitType === 'newsletter'
    ) {
      return explicitType;
    }

    const corpus = this.tokenizeWorkflowBootstrapText(
      params.prompt,
      params.label,
      params.name,
      params.platform,
      params.description,
    ).join(' ');

    if (
      corpus.includes('newsletter') ||
      corpus.includes('article') ||
      corpus.includes('blog')
    ) {
      return 'newsletter';
    }

    if (
      corpus.includes('video') ||
      corpus.includes('reel') ||
      corpus.includes('tiktok') ||
      corpus.includes('short')
    ) {
      return 'video';
    }

    if (
      corpus.includes('image') ||
      corpus.includes('graphic') ||
      corpus.includes('visual')
    ) {
      return 'image';
    }

    return 'post';
  }

  private scoreOfficialWorkflowSource(
    source: Pick<OfficialWorkflowSource, 'description' | 'kind' | 'name'>,
    params: Record<string, unknown>,
  ): number {
    const queryTokens = this.tokenizeWorkflowBootstrapText(
      params.prompt,
      params.label,
      params.name,
      params.platform,
      params.contentType,
    );
    const haystack = this.tokenizeWorkflowBootstrapText(
      source.name,
      source.description,
    );
    const haystackSet = new Set(haystack);

    let score = source.kind === 'seeded-template' ? 100 : 50;
    for (const token of queryTokens) {
      if (haystackSet.has(token)) {
        score += 8;
      }
    }

    const contentType = this.inferBootstrapContentType(params);
    if (
      contentType === 'post' &&
      haystack.some((token) =>
        ['content', 'linkedin', 'social', 'twitter', 'post'].includes(token),
      )
    ) {
      score += 12;
    }

    if (contentType === 'video' && haystack.includes('video')) {
      score += 12;
    }

    if (contentType === 'image' && haystack.includes('image')) {
      score += 12;
    }

    if (
      contentType === 'newsletter' &&
      haystack.some((token) => ['article', 'newsletter'].includes(token))
    ) {
      score += 12;
    }

    const platform =
      typeof params.platform === 'string' ? params.platform.toLowerCase() : '';
    if (platform && haystack.includes(platform)) {
      score += 16;
    }

    return score;
  }

  private async resolveOfficialWorkflowSource(
    params: Record<string, unknown>,
  ): Promise<OfficialWorkflowSource | null> {
    const templates = await this.workflowsService.getWorkflowTemplates();
    const seededCandidates: OfficialWorkflowSource[] = templates.map(
      (template) => ({
        confidence: this.scoreOfficialWorkflowSource(
          {
            description: template.description,
            kind: 'seeded-template',
            name: template.name,
          },
          params,
        ),
        description: template.description,
        id: template.id,
        kind: 'seeded-template',
        name: template.name,
      }),
    );

    const bestSeeded = seededCandidates.sort(
      (left, right) => right.confidence - left.confidence,
    )[0];

    if (bestSeeded && bestSeeded.confidence >= 112) {
      return bestSeeded;
    }

    if (!this.marketplaceApiClient) {
      return bestSeeded && bestSeeded.confidence >= 104 ? bestSeeded : null;
    }

    const listingQuery = this.tokenizeWorkflowBootstrapText(
      params.prompt,
      params.label,
      params.name,
      params.platform,
    ).join(' ');

    const officialListings = await this.marketplaceApiClient.searchListings({
      isOfficial: true,
      limit: 12,
      search: listingQuery || undefined,
      sort: '-publishedAt',
      type: 'workflow',
    });

    const listingDocs = Array.isArray(
      (officialListings as { docs?: unknown[] }).docs,
    )
      ? (((
          officialListings as unknown as {
            docs: Array<Record<string, unknown>>;
          }
        ).docs ?? []) as Array<Record<string, unknown>>)
      : [];

    const marketplaceCandidates: OfficialWorkflowSource[] = listingDocs.map(
      (listing) => ({
        confidence: this.scoreOfficialWorkflowSource(
          {
            description:
              (listing.shortDescription as string | undefined) ||
              (listing.description as string | undefined),
            kind: 'marketplace-listing',
            name: String(listing.title || ''),
          },
          params,
        ),
        description:
          (listing.shortDescription as string | undefined) ||
          (listing.description as string | undefined),
        id: String(listing._id || ''),
        kind: 'marketplace-listing',
        name: String(listing.title || 'Official workflow'),
        price: typeof listing.price === 'number' ? listing.price : Number.NaN,
        pricingTier:
          typeof listing.pricingTier === 'string'
            ? listing.pricingTier
            : undefined,
        slug: typeof listing.slug === 'string' ? listing.slug : undefined,
      }),
    );

    const bestMarketplace = marketplaceCandidates.sort(
      (left, right) => right.confidence - left.confidence,
    )[0];

    if (bestMarketplace && bestMarketplace.confidence >= 104) {
      return bestMarketplace;
    }

    return bestSeeded && bestSeeded.confidence >= 104 ? bestSeeded : null;
  }

  private async applyInstalledWorkflowContext(
    workflowId: string,
    ctx: ToolExecutionContext,
    params: Record<string, unknown>,
    source: OfficialWorkflowSource,
  ): Promise<void> {
    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: ctx.organizationId,
    });

    if (!workflow) {
      return;
    }

    const brand = await this.resolveWorkflowBrand(params, ctx);
    const schedule = readOptionalString(params.schedule);
    const timezone = readOptionalString(params.timezone) ?? 'UTC';

    await this.workflowsService.patch(workflowId, {
      brandId: brand?.id ? String(brand.id) : workflow.brandId,
      label:
        typeof params.label === 'string' && params.label.trim()
          ? params.label.trim()
          : workflow.label,
      metadata: {
        ...(workflow.metadata ?? {}),
        createdFrom: 'agent',
        sourceId: source.id,
        sourceType: source.kind,
      },
      ...(schedule
        ? {
            isScheduleEnabled: true,
            schedule,
            timezone,
          }
        : {}),
    } as never);
  }

  private async resolveWorkflowBrand(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<Record<string, unknown> | null> {
    if (typeof params.brandId === 'string') {
      const explicitBrand = await this.brandsService.findOne({
        _id: params.brandId,
        isDeleted: false,
        organization: ctx.organizationId,
      });

      if (explicitBrand) {
        return explicitBrand as unknown as Record<string, unknown>;
      }
    }

    const currentBrand = await this.brandsService.findOne({
      isDeleted: false,
      isSelected: true,
      organization: ctx.organizationId,
      user: ctx.userId,
    });

    if (currentBrand) {
      return currentBrand as unknown as Record<string, unknown>;
    }

    if (ctx.brandId) {
      const contextBrand = await this.brandsService.findOne({
        _id: ctx.brandId,
        isDeleted: false,
        organization: ctx.organizationId,
      });

      if (contextBrand) {
        return contextBrand as unknown as Record<string, unknown>;
      }
    }

    const firstOrgBrand = await this.brandsService.findOne({
      isDeleted: false,
      organization: ctx.organizationId,
    });

    return firstOrgBrand as unknown as Record<string, unknown> | null;
  }

  private buildWorkflowCreatedResult(params: {
    creditsUsed: number;
    description: string;
    nextRunAt?: Date | null;
    schedule?: string;
    scheduleSummary?: string;
    successDescription: string;
    timezone?: string;
    workflowId: string;
    workflowLabel: string;
    extraData?: Record<string, unknown>;
  }): AgentToolResult {
    return {
      creditsUsed: params.creditsUsed,
      data: {
        editorUrl: `/automations/editor/${params.workflowId}`,
        id: params.workflowId,
        label: params.workflowLabel,
        nextRunAt: params.nextRunAt ?? null,
        schedule: params.schedule ?? null,
        timezone: params.schedule && params.timezone ? params.timezone : null,
        ...(params.extraData ?? {}),
      },
      nextActions: [
        {
          ctas: [
            {
              href: `/automations/editor/${params.workflowId}`,
              label: 'Open workflow',
            },
            {
              href: '/automations/executions',
              label: 'Open executions',
            },
          ],
          description: params.successDescription,
          id: `workflow-created-${params.workflowId}`,
          nextRunAt: params.nextRunAt?.toISOString(),
          scheduleSummary: params.scheduleSummary,
          title: 'Automation created',
          type: 'workflow_created_card' as const,
          workflowDescription: params.description,
          workflowId: params.workflowId,
          workflowName: params.workflowLabel,
        },
      ],
      success: true,
    };
  }

  async listWorkflows(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = (params.limit as number) || 10;
    const workflows = await this.workflowsService.findAll(
      {
        where: {
          isDeleted: false,
          organization: ctx.organizationId,
        },
        orderBy: { updatedAt: -1 },
      },
      {},
    );
    const docs = (workflows.docs ?? []).slice(0, limit);

    return {
      creditsUsed: 0,
      data: {
        count: docs.length,
        workflows: docs.map((w) => {
          const workflow = w as unknown as Record<string, unknown>;
          return {
            description: workflow.description,
            id: String(workflow.id),
            name: workflow.name,
            status: workflow.status,
            updatedAt: workflow.updatedAt,
          };
        }),
      },
      success: true,
    };
  }

  async inspectWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const workflowId = readOptionalString(params.workflowId);
    if (!workflowId) {
      return {
        creditsUsed: 0,
        error: 'workflowId is required',
        success: false,
      };
    }

    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: ctx.organizationId,
    });

    if (!workflow) {
      return {
        creditsUsed: 0,
        error: `Workflow ${workflowId} not found`,
        success: false,
      };
    }

    return {
      creditsUsed: 0,
      data: {
        workflow: this.mapWorkflowForTool(
          workflow as unknown as Record<string, unknown>,
        ),
      },
      success: true,
    };
  }

  async duplicateWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const workflowId = readOptionalString(params.workflowId);
    if (!workflowId) {
      return {
        creditsUsed: 0,
        error: 'workflowId is required',
        success: false,
      };
    }

    const workflow = await this.workflowsService.cloneWorkflow(
      workflowId,
      ctx.userId,
      ctx.organizationId,
      ctx.brandId,
    );

    return {
      creditsUsed: 0,
      data: {
        workflow: this.mapWorkflowForTool(
          workflow as unknown as Record<string, unknown>,
        ),
      },
      success: true,
    };
  }

  async setWorkflowSchedule(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const workflowId = readOptionalString(params.workflowId);
    const enabled =
      typeof params.enabled === 'boolean' ? params.enabled : undefined;

    if (!workflowId || enabled === undefined) {
      return {
        creditsUsed: 0,
        error: 'workflowId and enabled are required',
        success: false,
      };
    }

    const schedule = readOptionalString(params.schedule);
    const timezone = readOptionalString(params.timezone) ?? 'UTC';
    if (enabled === true && !schedule) {
      return {
        creditsUsed: 0,
        error: 'schedule is required when enabling a workflow schedule',
        success: false,
      };
    }

    const response =
      enabled === false && !schedule
        ? await this.internalApi.callInternalApi(
            'DELETE',
            `/v1/workflows/${encodeURIComponent(workflowId)}/schedule`,
            undefined,
            ctx,
          )
        : await this.internalApi.callInternalApi(
            'POST',
            `/v1/workflows/${encodeURIComponent(workflowId)}/schedule`,
            {
              enabled,
              schedule,
              timezone,
            },
            ctx,
          );

    return {
      creditsUsed: 0,
      data: {
        enabled,
        response,
        schedule: schedule ?? null,
        timezone,
        workflowId,
      },
      success: true,
    };
  }

  async listWorkflowRuns(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const query = new URLSearchParams();
    const workflowId = readOptionalString(params.workflowId);
    const status = readOptionalString(params.status);
    const trigger = readOptionalString(params.trigger);
    const limit = readOptionalNumber(params.limit) ?? 20;
    const offset = readOptionalNumber(params.offset) ?? 0;

    query.set('limit', String(limit));
    query.set('offset', String(offset));
    if (workflowId) query.set('workflow', workflowId);
    if (status) query.set('status', status);
    if (trigger) query.set('trigger', trigger);

    const response = await this.internalApi.callInternalApi(
      'GET',
      `/v1/workflow-executions?${query.toString()}`,
      undefined,
      ctx,
    );

    return {
      creditsUsed: 0,
      data: {
        count: Array.isArray(response.data) ? response.data.length : 0,
        runs: response.data ?? [],
      },
      success: true,
    };
  }

  async getWorkflowRun(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const runId = readOptionalString(params.runId);
    if (!runId) {
      return {
        creditsUsed: 0,
        error: 'runId is required',
        success: false,
      };
    }

    const response = await this.internalApi.callInternalApi(
      'GET',
      `/v1/workflow-executions/${encodeURIComponent(runId)}`,
      undefined,
      ctx,
    );

    return {
      creditsUsed: 0,
      data: {
        run: response.data ?? response,
      },
      success: true,
    };
  }

  private mapWorkflowForTool(
    workflow: Record<string, unknown>,
  ): Record<string, unknown> {
    const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
    const edges = Array.isArray(workflow.edges) ? workflow.edges : [];

    return {
      description: workflow.description,
      edgeCount: edges.length,
      id: String(workflow.id ?? ''),
      inputVariables: Array.isArray(workflow.inputVariables)
        ? workflow.inputVariables
        : [],
      isScheduleEnabled: workflow.isScheduleEnabled,
      label: workflow.label ?? workflow.name,
      lifecycle: workflow.lifecycle,
      metadata: workflow.metadata,
      nodeCount: nodes.length,
      schedule: workflow.schedule,
      status: workflow.status,
      timezone: workflow.timezone,
      updatedAt: workflow.updatedAt,
    };
  }

  private async createWorkflowFromRecurringScaffold(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const prompt = String(params.prompt || '').trim();
    const schedule = String(params.schedule || '').trim();
    const requestedContentType = String(
      params.contentType || 'image',
    ).toLowerCase();
    const contentType =
      requestedContentType === 'video' ||
      requestedContentType === 'post' ||
      requestedContentType === 'newsletter'
        ? requestedContentType
        : 'image';
    const timezone = readOptionalString(params.timezone) ?? 'UTC';
    const requestedCount =
      typeof params.count === 'number'
        ? params.count
        : Number.parseInt(String(params.count || '1'), 10);
    const count = Number.isFinite(requestedCount)
      ? Math.max(1, Math.min(requestedCount, 12))
      : 1;
    const diversityMode =
      params.diversityMode === 'low' ||
      params.diversityMode === 'high' ||
      params.diversityMode === 'medium'
        ? params.diversityMode
        : 'medium';
    const styleNotes =
      typeof params.styleNotes === 'string' ? params.styleNotes.trim() : '';
    const negativePrompt =
      typeof params.negativePrompt === 'string'
        ? params.negativePrompt.trim()
        : '';

    if (!prompt || !schedule) {
      return {
        creditsUsed: 0,
        error: 'prompt and schedule are required',
        success: false,
      };
    }

    const brand = await this.resolveWorkflowBrand(params, ctx);
    if (!brand) {
      return {
        creditsUsed: 0,
        error:
          'No valid brand is available. Select a brand or refresh your brand context before creating a workflow.',
        success: false,
      };
    }
    const brandId = String(brand.id);
    const brandLabel = String(brand.label || 'your brand');
    const countLabel = count > 1 ? `${count} ${contentType}s per run` : null;

    const workflowLabel =
      String(params.label || params.name || '').trim() ||
      `${
        contentType === 'video'
          ? 'Video'
          : contentType === 'post'
            ? 'Post'
            : contentType === 'newsletter'
              ? 'Newsletter'
              : 'Image'
      } automation: ${prompt.slice(0, 48)}`;
    const taskDescription = [
      `Recurring ${contentType} generation workflow`,
      countLabel ? `Batch size: ${countLabel}` : null,
      `Prompt: ${prompt}`,
      styleNotes ? `Style notes: ${styleNotes}` : null,
      negativePrompt ? `Avoid: ${negativePrompt}` : null,
      `Diversity: ${diversityMode}`,
      `Schedule: ${schedule}`,
      `Timezone: ${timezone}`,
    ]
      .filter(Boolean)
      .join('\n');

    const workflowMetadata = {
      batchCount: count,
      brief: {
        contentType,
        count,
        diversityMode,
        negativePrompt: negativePrompt || undefined,
        prompt,
        styleNotes: styleNotes || undefined,
      },
      contentType,
      createdFrom: 'agent',
      originatingTool: AgentToolName.CREATE_WORKFLOW,
      prompt,
      sourceAssetId:
        typeof params.sourceAssetId === 'string'
          ? params.sourceAssetId
          : undefined,
      workflowType: 'recurring-agent-workflow',
    };

    const imageNodes =
      contentType === 'image'
        ? Array.from({ length: count }, (_, idx) => ({
            data: {
              config: {
                aspectRatio:
                  typeof params.aspectRatio === 'string'
                    ? params.aspectRatio
                    : '1:1',
                model:
                  typeof params.model === 'string'
                    ? params.model
                    : 'genfeed-ai/flux2-dev',
                prompt: this.buildImageVariationPrompt(
                  prompt,
                  idx + 1,
                  count,
                  diversityMode,
                  styleNotes,
                  negativePrompt,
                ),
                style: styleNotes || 'social-media',
              },
              label: count > 1 ? `Generate Image ${idx + 1}` : 'Generate Image',
            },
            id: `generate-image-${idx + 1}`,
            position: { x: 120 + idx * 220, y: 120 },
            type: 'ai-generate-image',
          }))
        : [];

    const workflow = await this.workflowsService.createWorkflow(
      ctx.userId,
      ctx.organizationId,
      {
        brandId,
        description: taskDescription,
        edges: [],
        inputVariables: [],
        isScheduleEnabled: true,
        label: workflowLabel,
        metadata: workflowMetadata,
        nodes:
          contentType === 'image'
            ? imageNodes
            : [
                {
                  data: {
                    config:
                      contentType === 'video'
                        ? {
                            aspectRatio:
                              typeof params.aspectRatio === 'string'
                                ? params.aspectRatio
                                : '9:16',
                            duration:
                              typeof params.duration === 'number'
                                ? params.duration
                                : 8,
                            model:
                              typeof params.model === 'string'
                                ? params.model
                                : 'kling-v2',
                            prompt,
                          }
                        : contentType === 'post'
                          ? {
                              brandId,
                              brandLabel,
                              credentialId:
                                typeof params.credentialId === 'string'
                                  ? params.credentialId
                                  : undefined,
                              prompt,
                              timezone,
                            }
                          : {
                              brandId,
                              brandLabel,
                              instructions:
                                typeof params.instructions === 'string'
                                  ? params.instructions
                                  : undefined,
                              prompt,
                              timezone,
                            },
                    label:
                      contentType === 'video'
                        ? 'Generate Video'
                        : contentType === 'post'
                          ? 'Generate Post'
                          : 'Generate Newsletter',
                  },
                  id: 'generate-primary',
                  position: { x: 120, y: 120 },
                  type:
                    contentType === 'video'
                      ? 'ai-generate-video'
                      : contentType === 'post'
                        ? 'ai-generate-post'
                        : 'ai-generate-newsletter',
                },
              ],
        schedule,
        timezone,
        trigger: WorkflowTrigger.MANUAL,
      } as never,
    );

    const workflowId = String(workflow.id);
    const nextRunAt = computeNextRunAtOrThrow(schedule, timezone);
    const scheduleSummary = formatRecurringSchedule(schedule, timezone, count);

    return this.buildWorkflowCreatedResult({
      creditsUsed: 1,
      description: taskDescription,
      extraData: {
        brandId,
        count,
        workflowId,
      },
      nextRunAt,
      schedule,
      scheduleSummary,
      successDescription: `Recurring ${contentType} automation is ready for ${brandLabel}.`,
      timezone,
      workflowId,
      workflowLabel,
    });
  }

  async installOfficialWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const confirmed = params.confirmed === true;
    const schedule = readOptionalString(params.schedule);
    const timezone = readOptionalString(params.timezone) ?? 'UTC';

    let source: OfficialWorkflowSource | null =
      typeof params.sourceId === 'string' &&
      typeof params.sourceType === 'string' &&
      params.sourceId.trim() &&
      params.sourceType.trim()
        ? {
            confidence: 999,
            description:
              typeof params.sourceDescription === 'string'
                ? params.sourceDescription
                : undefined,
            id: params.sourceId,
            kind: params.sourceType as OfficialWorkflowSourceKind,
            name:
              typeof params.sourceName === 'string' && params.sourceName.trim()
                ? params.sourceName
                : 'Official workflow',
            slug:
              typeof params.sourceSlug === 'string'
                ? params.sourceSlug
                : undefined,
          }
        : null;

    if (!source) {
      source = await this.resolveOfficialWorkflowSource(params);
    }

    if (!source) {
      if (!confirmed) {
        return {
          creditsUsed: 0,
          data: {
            confirmationRequired: true,
            resolution: 'generated',
          },
          nextActions: [
            {
              description:
                'No strong official workflow match was found. Reply to confirm and I will generate an org-owned workflow instead.',
              id: `workflow-bootstrap-preview-generated-${Date.now()}`,
              scheduleSummary: schedule
                ? formatRecurringSchedule(schedule, timezone)
                : undefined,
              title: 'Generate a new workflow?',
              type: 'workflow_created_card' as const,
              workflowDescription:
                typeof params.prompt === 'string' ? params.prompt : undefined,
              workflowName:
                typeof params.label === 'string' && params.label.trim()
                  ? params.label.trim()
                  : 'Generated workflow',
            },
          ],
          requiresConfirmation: true,
          success: true,
        };
      }

      return this.createWorkflowFromRecurringScaffold(
        {
          ...params,
          contentType: this.inferBootstrapContentType(params),
          timezone,
        },
        ctx,
      );
    }

    if (!confirmed) {
      const marketplaceUrl = this.buildMarketplaceListingUrl(source.slug);
      const confirmationPayload = {
        brandId:
          typeof params.brandId === 'string' && params.brandId.trim()
            ? params.brandId
            : undefined,
        contentType: this.inferBootstrapContentType(params),
        label:
          typeof params.label === 'string' && params.label.trim()
            ? params.label
            : undefined,
        prompt:
          typeof params.prompt === 'string' && params.prompt.trim()
            ? params.prompt
            : undefined,
        schedule,
        sourceDescription: source.description,
        sourceId: source.id,
        sourceName: source.name,
        sourceSlug: source.slug,
        sourceType: source.kind,
        timezone,
      };

      return {
        creditsUsed: 0,
        data: {
          confirmationRequired: true,
          resolution: source.kind,
          sourceDescription: source.description,
          sourceId: source.id,
          sourceName: source.name,
          sourceSlug: source.slug,
          sourceType: source.kind,
        },
        nextActions: [
          {
            ctas: marketplaceUrl
              ? [
                  {
                    action: 'confirm_install_official_workflow',
                    label: 'Confirm install',
                    payload: confirmationPayload,
                  },
                  { href: marketplaceUrl, label: 'Open source listing' },
                ]
              : [
                  {
                    action: 'confirm_install_official_workflow',
                    label: 'Confirm install',
                    payload: confirmationPayload,
                  },
                ],
            description:
              'Confirm to install this workflow into your organization, then apply your requested schedule and context.',
            id: `workflow-bootstrap-preview-${source.kind}-${source.id}`,
            scheduleSummary: schedule
              ? formatRecurringSchedule(schedule, timezone)
              : undefined,
            title: 'Install official workflow?',
            type: 'workflow_created_card' as const,
            workflowDescription: source.description,
            workflowName: source.name,
          },
        ],
        requiresConfirmation: true,
        success: true,
      };
    }

    if (source.kind === 'seeded-template') {
      const workflow = await this.workflowsService.createWorkflow(
        ctx.userId,
        ctx.organizationId,
        {
          isScheduleEnabled: Boolean(schedule),
          label:
            typeof params.label === 'string' && params.label.trim()
              ? params.label.trim()
              : source.name,
          metadata: {
            createdFrom: 'agent',
            sourceTemplateId: source.id,
            sourceType: 'seeded-template',
          },
          schedule,
          templateId: source.id,
          timezone,
          trigger: WorkflowTrigger.MANUAL,
        } as never,
      );

      const workflowId = String(workflow.id);
      await this.applyInstalledWorkflowContext(workflowId, ctx, params, source);

      const nextRunAt = schedule
        ? computeNextRunAtOrThrow(schedule, timezone)
        : null;

      return {
        creditsUsed: 0,
        data: {
          editorUrl: `/automations/editor/${workflowId}`,
          id: workflowId,
          installedFrom: source.kind,
          nextRunAt,
        },
        nextActions: [
          {
            ctas: [
              {
                href: `/automations/editor/${workflowId}`,
                label: 'Open workflow',
              },
              {
                href: '/automations/executions',
                label: 'Open executions',
              },
            ],
            description: 'Official workflow installed into your workspace.',
            id: `workflow-installed-${workflowId}`,
            nextRunAt: nextRunAt?.toISOString(),
            scheduleSummary: schedule
              ? formatRecurringSchedule(schedule, timezone)
              : undefined,
            title: 'Automation installed',
            type: 'workflow_created_card' as const,
            workflowDescription: source.description,
            workflowId,
            workflowName: source.name,
          },
        ],
        success: true,
      };
    }

    if (!this.marketplaceApiClient || !this.marketplaceInstallService) {
      return {
        creditsUsed: 0,
        error: 'Marketplace install services are unavailable.',
        success: false,
      };
    }

    const listing = await this.marketplaceApiClient.getListing(source.id);

    if (!listing) {
      return {
        creditsUsed: 0,
        error: 'Official marketplace workflow not found.',
        success: false,
      };
    }

    const ownership = await this.marketplaceApiClient.checkListingOwnership(
      source.id,
      ctx.userId,
      ctx.organizationId,
    );

    if (
      !ownership.owned &&
      ((listing.price ?? 0) > 0 || listing.pricingTier === 'premium')
    ) {
      const marketplaceUrl = this.buildMarketplaceListingUrl(listing.slug);

      return {
        creditsUsed: 0,
        data: {
          listingId: source.id,
          marketplaceUrl,
          requiresPurchase: true,
        },
        nextActions: [
          {
            ctas: marketplaceUrl
              ? [{ href: marketplaceUrl, label: 'Open marketplace listing' }]
              : [],
            description:
              'This official workflow is paid. Purchase it first, then I can install it into your workspace.',
            id: `workflow-purchase-required-${source.id}`,
            title: 'Purchase required',
            type: 'workflow_created_card' as const,
            workflowDescription: source.description,
            workflowName: source.name,
          },
        ],
        success: true,
      };
    }

    const purchase =
      ownership.purchase ??
      (await this.marketplaceApiClient.claimFreeItem(
        source.id,
        ctx.userId,
        ctx.organizationId,
      ));

    const installResult =
      await this.marketplaceInstallService.installToWorkspace(
        source.id,
        ctx.userId,
        ctx.organizationId,
      );

    await this.applyInstalledWorkflowContext(
      installResult.resourceId,
      ctx,
      params,
      source,
    );

    const nextRunAt = schedule
      ? computeNextRunAtOrThrow(schedule, timezone)
      : null;

    return {
      creditsUsed: 0,
      data: {
        editorUrl: `/automations/editor/${installResult.resourceId}`,
        id: installResult.resourceId,
        installedFrom: source.kind,
        nextRunAt,
        purchaseId: purchase ? String(purchase._id) : undefined,
      },
      nextActions: [
        {
          ctas: [
            {
              href: `/automations/editor/${installResult.resourceId}`,
              label: 'Open workflow',
            },
            {
              href: '/automations/executions',
              label: 'Open executions',
            },
          ],
          description: 'Official workflow installed into your workspace.',
          id: `workflow-installed-${installResult.resourceId}`,
          nextRunAt: nextRunAt?.toISOString(),
          scheduleSummary: schedule
            ? formatRecurringSchedule(schedule, timezone)
            : undefined,
          title: 'Automation installed',
          type: 'workflow_created_card' as const,
          workflowDescription: source.description,
          workflowId: installResult.resourceId,
          workflowName: source.name,
        },
      ],
      success: true,
    };
  }

  async createWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const hasGraphPayload =
      Array.isArray(params.nodes) ||
      Array.isArray(params.edges) ||
      Array.isArray(params.steps);
    const hasRecurringScaffold =
      typeof params.prompt === 'string' && params.prompt.trim().length > 0;
    const hasNaturalLanguageGenerationRequest =
      !hasGraphPayload &&
      typeof params.description === 'string' &&
      params.description.trim().length > 0;
    const timezone = readOptionalString(params.timezone) ?? 'UTC';
    const trigger =
      typeof params.trigger === 'string' && params.trigger.trim()
        ? params.trigger
        : WorkflowTrigger.MANUAL;
    const schedule = readOptionalString(params.schedule);
    const isScheduleEnabled =
      typeof params.isScheduleEnabled === 'boolean'
        ? params.isScheduleEnabled
        : Boolean(schedule);

    if (hasRecurringScaffold && schedule) {
      return this.createWorkflowFromRecurringScaffold(params, ctx);
    }

    const brand = await this.resolveWorkflowBrand(params, ctx);
    if (!brand) {
      return {
        creditsUsed: 0,
        error:
          'No valid brand is available. Select a brand or refresh your brand context before creating a workflow.',
        success: false,
      };
    }
    const brandId = String(brand.id);
    const brandLabel = String(brand.label || 'your brand');
    const workflowBrandIds = [brandId];

    let workflowLabel = String(params.label || params.name || '').trim();
    let description =
      typeof params.description === 'string' ? params.description : undefined;
    let nodes = Array.isArray(params.nodes)
      ? (params.nodes as Array<Record<string, unknown>>)
      : undefined;
    let edges = Array.isArray(params.edges)
      ? (params.edges as Array<Record<string, unknown>>)
      : undefined;

    if (hasNaturalLanguageGenerationRequest) {
      if (!this.workflowGenerationService) {
        return {
          creditsUsed: 0,
          error: 'Workflow generation service is unavailable.',
          success: false,
        };
      }

      const generated =
        await this.workflowGenerationService.generateWorkflowFromDescription({
          description: params.description as string,
          targetPlatforms: Array.isArray(params.targetPlatforms)
            ? (params.targetPlatforms as string[])
            : undefined,
        });

      workflowLabel =
        workflowLabel ||
        String(generated.workflow.name || 'Generated workflow').trim();
      description =
        (typeof generated.workflow.description === 'string'
          ? generated.workflow.description
          : undefined) || description;
      nodes = Array.isArray(generated.workflow.nodes)
        ? (generated.workflow.nodes as Array<Record<string, unknown>>)
        : nodes;
      edges = Array.isArray(generated.workflow.edges)
        ? (generated.workflow.edges as Array<Record<string, unknown>>)
        : edges;
    }

    if (!workflowLabel) {
      return {
        creditsUsed: 0,
        error: 'label is required',
        success: false,
      };
    }

    const normalizedMetadata =
      params.metadata && typeof params.metadata === 'object'
        ? {
            ...(params.metadata as Record<string, unknown>),
            brandId,
            createdFrom: 'agent',
            originatingTool: AgentToolName.CREATE_WORKFLOW,
          }
        : {
            brandId,
            createdFrom: 'agent',
            originatingTool: AgentToolName.CREATE_WORKFLOW,
          };

    const workflow = await this.workflowsService.createWorkflow(
      ctx.userId,
      ctx.organizationId,
      {
        brandId: workflowBrandIds[0],
        description,
        edges,
        inputVariables: Array.isArray(params.inputVariables)
          ? (params.inputVariables as Array<Record<string, unknown>>)
          : undefined,
        isScheduleEnabled,
        label: workflowLabel,
        metadata: normalizedMetadata,
        nodes,
        schedule,
        steps: Array.isArray(params.steps)
          ? (params.steps as Array<Record<string, unknown>>)
          : undefined,
        templateId:
          typeof params.templateId === 'string' ? params.templateId : undefined,
        timezone,
        trigger: trigger as WorkflowTrigger,
      } as never,
    );

    const workflowId = String(
      workflow.id ?? (workflow as Record<string, unknown>).id,
    );
    const nextRunAt =
      schedule && isScheduleEnabled
        ? computeNextRunAtOrThrow(schedule, timezone)
        : null;
    const scheduleSummary =
      schedule && isScheduleEnabled
        ? formatRecurringSchedule(schedule, timezone)
        : undefined;

    return this.buildWorkflowCreatedResult({
      creditsUsed: 0,
      description: description ?? workflowLabel,
      extraData: {
        brandId,
      },
      nextRunAt,
      schedule,
      scheduleSummary,
      successDescription: `Workflow created for ${brandLabel}.`,
      timezone,
      workflowId,
      workflowLabel,
    });
  }

  async executeWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const workflowId = params.workflowId as string;
    const inputValues =
      (params.inputs as Record<string, unknown> | undefined) ??
      (params.inputValues as Record<string, unknown> | undefined) ??
      {};

    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: ctx.organizationId,
    });

    if (!workflow) {
      return {
        creditsUsed: 0,
        error: `Workflow ${workflowId} not found`,
        success: false,
      };
    }

    const requiredVars = (workflow.inputVariables ?? []).filter(
      (v) => v.required,
    );
    const missingKeys = requiredVars
      .filter((v) => !(v.key in inputValues))
      .map((v) => v.key);

    if (missingKeys.length > 0) {
      return {
        creditsUsed: 0,
        error: `Missing required workflow inputs: ${missingKeys.join(', ')}. Use get_workflow_inputs to discover expected variables.`,
        success: false,
      };
    }

    const result = ctx.validatedScope
      ? await this.workflowExecutorService.executeManualWorkflow(
          workflowId,
          ctx.userId,
          ctx.organizationId,
          inputValues,
          { agentScope: toAgentScopeMetadata(ctx.validatedScope) },
          WorkflowExecutionTrigger.MANUAL,
          ctx.validatedScope,
        )
      : await this.workflowExecutorService.executeManualWorkflow(
          workflowId,
          ctx.userId,
          ctx.organizationId,
          inputValues,
        );

    return {
      creditsUsed: 0,
      data: {
        id: result.executionId,
        status: result.status,
      },
      success: true,
    };
  }

  async getWorkflowInputs(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const workflowId = params.workflowId as string;

    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: ctx.organizationId,
    });

    if (!workflow) {
      return {
        creditsUsed: 0,
        error: `Workflow ${workflowId} not found`,
        success: false,
      };
    }

    const inputs = (workflow.inputVariables ?? []).map((v) => ({
      defaultValue: v.defaultValue ?? null,
      description: v.description ?? null,
      key: v.key,
      label: v.label,
      required: v.required ?? false,
      type: v.type,
    }));

    return {
      creditsUsed: 0,
      data: {
        inputs,
        workflowId: String(workflow.id),
        workflowName:
          (workflow as unknown as Record<string, unknown>).name ??
          (workflow as unknown as Record<string, unknown>).label ??
          null,
      },
      success: true,
    };
  }
}
