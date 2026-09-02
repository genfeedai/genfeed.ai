import type {
  WorkflowEdgeDto,
  WorkflowInputVariableDto,
  WorkflowVisualNodeDto,
} from '@api/collections/workflows/dto/create-workflow.dto';
import { WorkflowGenerationService } from '@api/collections/workflows/services/workflow-generation.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { computeNextRunAtOrThrow } from '@api/collections/workflows/utils/cron-schedule.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import { resolveWorkflowBrand } from '@api/services/agent-orchestrator/tools/agent-workflow-tool.helpers';
import type {
  AgentBrandsServiceLike,
  GeneratedWorkflowGraph,
  RecurringScaffoldParams,
  RecurringTaskContentType,
} from '@api/services/agent-orchestrator/tools/agent-workflow-tool.types';
import { createGenfeedActionNode } from '@genfeedai/actions';
import { WorkflowTrigger } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { AgentToolName } from '@genfeedai/contracts/interfaces';
import { formatRecurringSchedule } from '@helpers/formatting/recurring-schedule/recurring-schedule.helper';
import { Inject, Injectable, Optional } from '@nestjs/common';

const MISSING_BRAND_ERROR =
  'No valid brand is available. Select a brand or refresh your brand context before creating a workflow.';

function asWorkflowDtoArray<T>(value: unknown): T[] | undefined {
  return Array.isArray(value) ? (value as T[]) : undefined;
}

/**
 * Create-workflow tools: graph payload, NL generation, and recurring scaffold.
 */
@Injectable()
export class AgentWorkflowToolCreateService {
  constructor(
    private readonly workflowsService: WorkflowsService,
    @Inject('AGENT_BRANDS_SERVICE')
    private readonly brandsService: AgentBrandsServiceLike,
    @Optional()
    private readonly workflowGenerationService?: WorkflowGenerationService,
  ) {}

  async createWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const hasGraphPayload =
      Array.isArray(params.nodes) || Array.isArray(params.edges);
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

    const brand = await resolveWorkflowBrand(this.brandsService, params, ctx);
    if (!brand) {
      return {
        creditsUsed: 0,
        error: MISSING_BRAND_ERROR,
        success: false,
      };
    }
    const brandId = String(brand.id);
    const brandLabel = String(brand.label || 'your brand');

    const graph = await this.resolveCreatedWorkflowGraph(
      params,
      hasNaturalLanguageGenerationRequest,
    );
    if ('error' in graph) {
      return graph.error;
    }

    return this.persistCreatedWorkflow({
      brandId,
      brandLabel,
      ctx,
      description: graph.description,
      edges: graph.edges,
      isScheduleEnabled,
      nodes: graph.nodes,
      params,
      schedule,
      timezone,
      trigger,
      workflowLabel: graph.workflowLabel,
    });
  }

  async createWorkflowFromRecurringScaffold(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const parsed = this.parseRecurringScaffoldParams(params);
    if ('error' in parsed) {
      return parsed.error;
    }

    const brand = await resolveWorkflowBrand(this.brandsService, params, ctx);
    if (!brand) {
      return {
        creditsUsed: 0,
        error: MISSING_BRAND_ERROR,
        success: false,
      };
    }

    return this.persistRecurringScaffoldWorkflow(parsed, brand, params, ctx);
  }

  private async resolveCreatedWorkflowGraph(
    params: Record<string, unknown>,
    hasNaturalLanguageGenerationRequest: boolean,
  ): Promise<GeneratedWorkflowGraph | { error: AgentToolResult }> {
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
          error: {
            creditsUsed: 0,
            error: 'Workflow generation service is unavailable.',
            success: false,
          },
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
        error: {
          creditsUsed: 0,
          error: 'label is required',
          success: false,
        },
      };
    }

    return { description, edges, nodes, workflowLabel };
  }

  private async persistCreatedWorkflow(input: {
    brandId: string;
    brandLabel: string;
    ctx: ToolExecutionContext;
    description: string | undefined;
    edges: Array<Record<string, unknown>> | undefined;
    isScheduleEnabled: boolean;
    nodes: Array<Record<string, unknown>> | undefined;
    params: Record<string, unknown>;
    schedule: string | undefined;
    timezone: string;
    trigger: string;
    workflowLabel: string;
  }): Promise<AgentToolResult> {
    const { brandId, params } = input;
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
      input.ctx.userId,
      input.ctx.organizationId,
      {
        brandId,
        description: input.description,
        edges: asWorkflowDtoArray<WorkflowEdgeDto>(input.edges),
        inputVariables: asWorkflowDtoArray<WorkflowInputVariableDto>(
          params.inputVariables,
        ),
        isScheduleEnabled: input.isScheduleEnabled,
        label: input.workflowLabel,
        metadata: normalizedMetadata,
        nodes: asWorkflowDtoArray<WorkflowVisualNodeDto>(input.nodes),
        schedule: input.schedule,
        templateId:
          typeof params.templateId === 'string' ? params.templateId : undefined,
        timezone: input.timezone,
        trigger: input.trigger as WorkflowTrigger,
      },
    );

    const workflowId = String(
      workflow.id ?? (workflow as Record<string, unknown>).id,
    );
    const nextRunAt =
      input.schedule && input.isScheduleEnabled
        ? computeNextRunAtOrThrow(input.schedule, input.timezone)
        : null;
    const scheduleSummary =
      input.schedule && input.isScheduleEnabled
        ? formatRecurringSchedule(input.schedule, input.timezone)
        : undefined;

    return this.buildWorkflowCreatedResult({
      creditsUsed: 0,
      description: input.description ?? input.workflowLabel,
      extraData: {
        brandId,
      },
      nextRunAt,
      schedule: input.schedule,
      scheduleSummary,
      successDescription: `Workflow created for ${input.brandLabel}.`,
      timezone: input.timezone,
      workflowId,
      workflowLabel: input.workflowLabel,
    });
  }

  private parseRecurringScaffoldParams(
    params: Record<string, unknown>,
  ): RecurringScaffoldParams | { error: AgentToolResult } {
    const prompt = String(params.prompt || '').trim();
    const schedule = String(params.schedule || '').trim();
    const requestedContentType = String(
      params.contentType || 'image',
    ).toLowerCase();
    const contentType: RecurringTaskContentType =
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
        error: {
          creditsUsed: 0,
          error: 'prompt and schedule are required',
          success: false,
        },
      };
    }

    return {
      contentType,
      count,
      diversityMode,
      negativePrompt,
      prompt,
      schedule,
      styleNotes,
      timezone,
    };
  }

  private async persistRecurringScaffoldWorkflow(
    parsed: RecurringScaffoldParams,
    brand: Record<string, unknown>,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const brandId = String(brand.id);
    const brandLabel = String(brand.label || 'your brand');
    const countLabel =
      parsed.count > 1
        ? `${parsed.count} ${parsed.contentType}s per run`
        : null;
    const workflowLabel = this.buildRecurringScaffoldLabel(parsed, params);
    const taskDescription = [
      `Recurring ${parsed.contentType} generation workflow`,
      countLabel ? `Batch size: ${countLabel}` : null,
      `Prompt: ${parsed.prompt}`,
      parsed.styleNotes ? `Style notes: ${parsed.styleNotes}` : null,
      parsed.negativePrompt ? `Avoid: ${parsed.negativePrompt}` : null,
      `Diversity: ${parsed.diversityMode}`,
      `Schedule: ${parsed.schedule}`,
      `Timezone: ${parsed.timezone}`,
    ]
      .filter(Boolean)
      .join('\n');

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
        metadata: this.buildRecurringScaffoldMetadata(parsed, params),
        nodes: asWorkflowDtoArray<WorkflowVisualNodeDto>(
          this.buildRecurringScaffoldNodes(parsed, params, brandId, brandLabel),
        ),
        schedule: parsed.schedule,
        timezone: parsed.timezone,
        trigger: WorkflowTrigger.MANUAL,
      },
    );

    const workflowId = String(workflow.id);
    const nextRunAt = computeNextRunAtOrThrow(parsed.schedule, parsed.timezone);
    const scheduleSummary = formatRecurringSchedule(
      parsed.schedule,
      parsed.timezone,
      parsed.count,
    );

    return this.buildWorkflowCreatedResult({
      creditsUsed: 1,
      description: taskDescription,
      extraData: {
        brandId,
        count: parsed.count,
        workflowId,
      },
      nextRunAt,
      schedule: parsed.schedule,
      scheduleSummary,
      successDescription: `Recurring ${parsed.contentType} automation is ready for ${brandLabel}.`,
      timezone: parsed.timezone,
      workflowId,
      workflowLabel,
    });
  }

  private buildRecurringScaffoldLabel(
    parsed: RecurringScaffoldParams,
    params: Record<string, unknown>,
  ): string {
    return (
      String(params.label || params.name || '').trim() ||
      `${
        parsed.contentType === 'video'
          ? 'Video'
          : parsed.contentType === 'post'
            ? 'Post'
            : parsed.contentType === 'newsletter'
              ? 'Newsletter'
              : 'Image'
      } automation: ${parsed.prompt.slice(0, 48)}`
    );
  }

  private buildRecurringScaffoldMetadata(
    parsed: RecurringScaffoldParams,
    params: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      batchCount: parsed.count,
      brief: {
        contentType: parsed.contentType,
        count: parsed.count,
        diversityMode: parsed.diversityMode,
        negativePrompt: parsed.negativePrompt || undefined,
        prompt: parsed.prompt,
        styleNotes: parsed.styleNotes || undefined,
      },
      contentType: parsed.contentType,
      createdFrom: 'agent',
      originatingTool: AgentToolName.CREATE_WORKFLOW,
      prompt: parsed.prompt,
      sourceAssetId:
        typeof params.sourceAssetId === 'string'
          ? params.sourceAssetId
          : undefined,
      workflowType: 'recurring-agent-workflow',
    };
  }

  private buildRecurringScaffoldNodes(
    parsed: RecurringScaffoldParams,
    params: Record<string, unknown>,
    brandId: string,
    brandLabel: string,
  ): Array<Record<string, unknown>> {
    if (parsed.contentType === 'image') {
      return Array.from({ length: parsed.count }, (_, idx) =>
        this.buildRecurringActionNode({
          actionId: 'imageGen',
          id: `generate-image-${idx + 1}`,
          label:
            parsed.count > 1 ? `Generate Image ${idx + 1}` : 'Generate Image',
          parameters: {
            aspectRatio:
              typeof params.aspectRatio === 'string'
                ? params.aspectRatio
                : '1:1',
            model:
              typeof params.model === 'string'
                ? params.model
                : 'genfeed-ai/flux2-dev',
            prompt: this.buildImageVariationPrompt(
              parsed.prompt,
              idx + 1,
              parsed.count,
              parsed.diversityMode,
              parsed.styleNotes,
              parsed.negativePrompt,
            ),
            style: parsed.styleNotes || 'social-media',
          },
          position: { x: 120 + idx * 220, y: 120 },
        }),
      );
    }

    const actionId =
      parsed.contentType === 'video'
        ? 'videoGen'
        : parsed.contentType === 'post'
          ? 'postGen'
          : 'newsletterGen';
    const label =
      parsed.contentType === 'video'
        ? 'Generate Video'
        : parsed.contentType === 'post'
          ? 'Generate Post'
          : 'Generate Newsletter';

    return [
      this.buildRecurringActionNode({
        actionId,
        id: 'generate-primary',
        label,
        parameters:
          parsed.contentType === 'video'
            ? {
                aspectRatio:
                  typeof params.aspectRatio === 'string'
                    ? params.aspectRatio
                    : '9:16',
                duration:
                  typeof params.duration === 'number' ? params.duration : 8,
                model:
                  typeof params.model === 'string' ? params.model : 'kling-v2',
                prompt: parsed.prompt,
              }
            : parsed.contentType === 'post'
              ? {
                  brandId,
                  brandLabel,
                  credentialId:
                    typeof params.credentialId === 'string'
                      ? params.credentialId
                      : undefined,
                  prompt: parsed.prompt,
                  timezone: parsed.timezone,
                }
              : {
                  brandId,
                  brandLabel,
                  instructions:
                    typeof params.instructions === 'string'
                      ? params.instructions
                      : undefined,
                  prompt: parsed.prompt,
                  timezone: parsed.timezone,
                },
        position: { x: 120, y: 120 },
      }),
    ];
  }

  private buildRecurringActionNode(input: {
    actionId: string;
    id: string;
    label: string;
    parameters: Record<string, unknown>;
    position: { x: number; y: number };
  }): Record<string, unknown> {
    const node = createGenfeedActionNode({
      actionId: input.actionId,
      id: input.id,
      label: input.label,
      position: input.position,
    });

    return {
      ...node,
      data: {
        ...node.data,
        config: {
          actionId: input.actionId,
          parameters: input.parameters,
        },
      },
    };
  }

  private buildImageVariationPrompt(
    prompt: string,
    index: number,
    count: number,
    diversityMode: 'high' | 'low' | 'medium',
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

  private buildWorkflowCreatedResult(params: {
    creditsUsed: number;
    description: string;
    extraData?: Record<string, unknown>;
    nextRunAt?: Date | null;
    schedule?: string;
    scheduleSummary?: string;
    successDescription: string;
    timezone?: string;
    workflowId: string;
    workflowLabel: string;
  }): AgentToolResult {
    return {
      creditsUsed: params.creditsUsed,
      data: {
        editorUrl: `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${params.workflowId}`,
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
              href: `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${params.workflowId}`,
              label: 'Open workflow',
            },
            {
              href: APP_ROUTES.AUTOMATION.RUNS,
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
}
