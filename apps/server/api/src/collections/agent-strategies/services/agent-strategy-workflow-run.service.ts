import { getAgentTypeWorkflowDefault } from '@api/collections/agent-strategies/constants/agent-type-workflow-defaults.constant';
import type {
  AgentStrategyWorkflowBindingPreview,
  AgentStrategyWorkflowInputPreview,
  AgentStrategyWorkflowRunResult,
  RunAgentStrategyWorkflowDto,
} from '@api/collections/agent-strategies/dto/run-agent-strategy-workflow.dto';
import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/workflow-templates';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowExecutionTrigger, WorkflowStatus } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  Optional,
  ServiceUnavailableException,
  type Type,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

type WorkflowInputVariableLike = {
  defaultValue?: unknown;
  description?: string;
  key: string;
  label?: string;
  required?: boolean;
  type?: string;
};

type ResolvedWorkflow = {
  id: string;
  inputVariables: WorkflowInputVariableLike[];
  label: string | null;
  templateId: string | null;
};

/**
 * Deterministic agent → workflow path: resolve bound (or default) template,
 * fill inputVariables from strategy context + optional overrides, execute.
 * Does not call the LLM for tool selection.
 */
@Injectable()
export class AgentStrategyWorkflowRunService {
  private readonly logContext = 'AgentStrategyWorkflowRunService';

  constructor(
    private readonly agentStrategiesService: AgentStrategiesService,
    @Optional() private readonly workflowsService: WorkflowsService | undefined,
    @Optional()
    private readonly workflowExecutorService:
      | WorkflowExecutorService
      | undefined,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  async preview(
    strategyId: string,
    organizationId: string,
    overrides: RunAgentStrategyWorkflowDto = {},
  ): Promise<AgentStrategyWorkflowBindingPreview> {
    const strategy = await this.requireStrategy(strategyId, organizationId);
    const resolved = await this.resolveWorkflow(strategy, organizationId, {
      createIfMissing: false,
      userId: strategy.userId,
      workflowIdOverride: overrides.workflowId,
    });

    const filled = this.buildFilledInputs(strategy, resolved, overrides);

    return {
      inputs: filled.previews,
      missingRequiredKeys: filled.missingRequiredKeys,
      preferredWorkflowId: this.readConfigString(
        strategy,
        'preferredWorkflowId',
      ),
      preferredWorkflowTemplateId:
        this.readConfigString(strategy, 'preferredWorkflowTemplateId') ??
        getAgentTypeWorkflowDefault(strategy.agentType)?.templateId ??
        null,
      templateDescription:
        getAgentTypeWorkflowDefault(strategy.agentType)?.description ?? null,
      workflowId: resolved?.id ?? null,
      workflowLabel: resolved?.label ?? null,
    };
  }

  async run(
    strategyId: string,
    organizationId: string,
    userId: string,
    overrides: RunAgentStrategyWorkflowDto = {},
  ): Promise<AgentStrategyWorkflowRunResult> {
    const strategy = await this.requireStrategy(strategyId, organizationId);
    const resolved = await this.resolveWorkflow(strategy, organizationId, {
      createIfMissing: true,
      userId,
      workflowIdOverride: overrides.workflowId,
    });

    if (!resolved) {
      throw new BadRequestException(
        'No workflow is bound to this agent and no default template is available for its type. Set preferredWorkflowId or preferredWorkflowTemplateId on the strategy.',
      );
    }

    const filled = this.buildFilledInputs(strategy, resolved, overrides);

    if (filled.missingRequiredKeys.length > 0) {
      throw new BadRequestException(
        `Missing required workflow inputs: ${filled.missingRequiredKeys.join(', ')}. Provide them via topic, prompt, referenceImage, or inputs.`,
      );
    }

    // Persist binding so subsequent Run Workflow hits the same graph.
    await this.persistPreferredWorkflow(strategy, resolved);

    this.logger.log(
      `Running workflow ${resolved.id} for strategy ${strategyId}`,
      this.logContext,
    );

    const workflowExecutorService = this.resolveRequiredProvider(
      this.workflowExecutorService,
      WorkflowExecutorService,
      'Workflow executor',
    );
    const result = await workflowExecutorService.executeManualWorkflow(
      resolved.id,
      userId,
      organizationId,
      filled.values,
      {
        agentStrategyId: strategyId,
        agentType: strategy.agentType ?? null,
        createdFrom: 'agent-strategy',
        preferredWorkflowTemplateId: resolved.templateId,
      },
      WorkflowExecutionTrigger.MANUAL,
    );

    return {
      executionId: result.executionId,
      filledInputs: filled.values,
      missingRequiredKeys: [],
      status: result.status,
      workflowId: resolved.id,
      workflowLabel: resolved.label,
    };
  }

  private async requireStrategy(
    strategyId: string,
    organizationId: string,
  ): Promise<AgentStrategyDocument> {
    const strategy = await this.agentStrategiesService.findOneById(
      strategyId,
      organizationId,
    );
    if (!strategy) {
      throw new NotFoundException('Strategy');
    }
    return strategy;
  }

  private async resolveWorkflow(
    strategy: AgentStrategyDocument,
    organizationId: string,
    options: {
      createIfMissing: boolean;
      userId: string;
      workflowIdOverride?: string;
    },
  ): Promise<ResolvedWorkflow | null> {
    if (options.workflowIdOverride) {
      return this.loadWorkflowById(options.workflowIdOverride, organizationId);
    }

    const preferredWorkflowId = this.readConfigString(
      strategy,
      'preferredWorkflowId',
    );
    if (preferredWorkflowId) {
      const existing = await this.loadWorkflowById(
        preferredWorkflowId,
        organizationId,
      );
      if (existing) {
        return existing;
      }
    }

    const templateId =
      this.readConfigString(strategy, 'preferredWorkflowTemplateId') ??
      getAgentTypeWorkflowDefault(strategy.agentType)?.templateId ??
      null;

    if (!templateId) {
      return null;
    }

    const installed = await this.findInstalledByTemplateId(
      organizationId,
      templateId,
      strategy.brandId ?? null,
    );
    if (installed) {
      return installed;
    }

    if (!options.createIfMissing) {
      // Preview without installing — surface template-defined inputs.
      const template = WORKFLOW_TEMPLATES[templateId];
      if (!template) {
        return null;
      }
      return {
        id: '',
        inputVariables: (template.inputVariables ??
          []) as WorkflowInputVariableLike[],
        label: template.name ?? templateId,
        templateId,
      };
    }

    if (!WORKFLOW_TEMPLATES[templateId]) {
      throw new BadRequestException(
        `Unknown workflow template "${templateId}" for agent type ${strategy.agentType ?? 'unknown'}.`,
      );
    }

    const workflowCreate: CreateWorkflowDto = {
      brandId: strategy.brandId ?? undefined,
      isScheduleEnabled: false,
      label: `${strategy.label ?? 'Agent'} — content workflow`,
      status: WorkflowStatus.ACTIVE,
      templateId,
    };
    const workflowsService = this.resolveRequiredProvider(
      this.workflowsService,
      WorkflowsService,
      'Workflows',
    );
    const created = await workflowsService.createWorkflow(
      options.userId,
      organizationId,
      workflowCreate,
      strategy.brandId ?? undefined,
    );

    return this.loadWorkflowById(String(created.id), organizationId);
  }

  private async loadWorkflowById(
    workflowId: string,
    organizationId: string,
  ): Promise<ResolvedWorkflow | null> {
    if (!workflowId) {
      return null;
    }

    const workflowsService = this.resolveRequiredProvider(
      this.workflowsService,
      WorkflowsService,
      'Workflows',
    );
    const workflow = await workflowsService.findOne({
      id: workflowId,
      isDeleted: false,
      organizationId,
    });

    if (!workflow) {
      return null;
    }

    const record = workflow as Record<string, unknown>;
    const metadata =
      record.metadata &&
      typeof record.metadata === 'object' &&
      !Array.isArray(record.metadata)
        ? (record.metadata as Record<string, unknown>)
        : {};

    return {
      id: String(workflow.id),
      inputVariables: Array.isArray(workflow.inputVariables)
        ? (workflow.inputVariables as WorkflowInputVariableLike[])
        : [],
      label:
        (typeof record.label === 'string' && record.label) ||
        (typeof record.name === 'string' && record.name) ||
        null,
      templateId:
        typeof metadata.sourceTemplateId === 'string'
          ? metadata.sourceTemplateId
          : null,
    };
  }

  private resolveRequiredProvider<T>(
    direct: T | undefined,
    token: Type<T>,
    label: string,
  ): T {
    if (direct) {
      return direct;
    }
    try {
      const resolved = this.moduleRef?.get(token, { strict: false });
      if (resolved) {
        return resolved;
      }
    } catch {
      // Converted below to a stable API error.
    }
    throw new ServiceUnavailableException(`${label} service is unavailable`);
  }

  private async findInstalledByTemplateId(
    organizationId: string,
    templateId: string,
    brandId: string | null,
  ): Promise<ResolvedWorkflow | null> {
    const rows = await this.prisma.workflow.findMany({
      select: {
        brandId: true,
        id: true,
        metadata: true,
      },
      take: 50,
      where: scopedWhere(organizationId, {
        brandId: brandId ?? undefined,
      }),
    });

    const match = rows.find((row) => {
      const metadata =
        row.metadata &&
        typeof row.metadata === 'object' &&
        !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      return metadata.sourceTemplateId === templateId;
    });

    if (!match) {
      return null;
    }

    // `inputVariables` is not a `workflows` column: it is hydrated from the
    // pinned current version's definition, so the matched row is reloaded
    // through the service that performs that hydration.
    const resolved = await this.loadWorkflowById(match.id, organizationId);
    return resolved ? { ...resolved, templateId } : null;
  }

  private buildFilledInputs(
    strategy: AgentStrategyDocument,
    workflow: ResolvedWorkflow | null,
    overrides: RunAgentStrategyWorkflowDto,
  ): {
    missingRequiredKeys: string[];
    previews: AgentStrategyWorkflowInputPreview[];
    values: Record<string, unknown>;
  } {
    const variables = workflow?.inputVariables ?? [];
    const strategyDefaults = this.readWorkflowInputDefaults(strategy);
    const topic =
      overrides.topic?.trim() ||
      (Array.isArray(strategy.topics) && strategy.topics[0]
        ? String(strategy.topics[0]).trim()
        : '') ||
      strategy.label ||
      'Brand content';
    const prompt =
      overrides.prompt?.trim() || this.buildDefaultPrompt(strategy, topic);
    const voice =
      typeof strategy.voice === 'string' ? strategy.voice.trim() : '';
    const platform =
      Array.isArray(strategy.platforms) && strategy.platforms[0]
        ? String(strategy.platforms[0])
        : 'twitter';
    const brandId =
      typeof strategy.brandId === 'string' ? strategy.brandId : undefined;
    const brandLabel =
      strategy.brand &&
      typeof strategy.brand === 'object' &&
      'label' in strategy.brand &&
      typeof (strategy.brand as { label?: unknown }).label === 'string'
        ? (strategy.brand as { label: string }).label
        : undefined;

    const aliasPool: Record<string, unknown> = {
      angle: prompt || voice || `Brand voice for ${topic}`,
      brandCues: voice || brandLabel || topic,
      brandId,
      brandLabel,
      coreTakeaway: prompt || voice || topic,
      cta: overrides.cta?.trim() || 'Follow for more',
      photoUrl: overrides.referenceImage,
      platform,
      platformFormat: platform,
      proofPoint: voice || prompt || topic,
      prompt,
      referenceImage: overrides.referenceImage,
      script: prompt,
      sourceNotes: voice || prompt,
      thesis: prompt || topic,
      thumbnailConcept: prompt || topic,
      titleText: topic,
      topic,
      topicContext: prompt || topic,
      visualAngle: prompt || topic,
      visualStyle: voice || 'clean brand editorial',
    };

    const values: Record<string, unknown> = {};
    const previews: AgentStrategyWorkflowInputPreview[] = [];

    for (const variable of variables) {
      const key = variable.key;
      let source: AgentStrategyWorkflowInputPreview['source'] = 'unfilled';
      let filledValue: unknown;

      if (
        overrides.inputs &&
        Object.hasOwn(overrides.inputs, key) &&
        overrides.inputs[key] !== undefined &&
        overrides.inputs[key] !== null &&
        overrides.inputs[key] !== ''
      ) {
        filledValue = overrides.inputs[key];
        source = 'override';
      } else if (
        Object.hasOwn(strategyDefaults, key) &&
        strategyDefaults[key] !== undefined &&
        strategyDefaults[key] !== null &&
        strategyDefaults[key] !== ''
      ) {
        filledValue = strategyDefaults[key];
        source = 'strategy';
      } else if (
        Object.hasOwn(aliasPool, key) &&
        aliasPool[key] !== undefined &&
        aliasPool[key] !== null &&
        aliasPool[key] !== ''
      ) {
        filledValue = aliasPool[key];
        source = 'strategy';
      } else if (
        variable.defaultValue !== undefined &&
        variable.defaultValue !== null &&
        variable.defaultValue !== ''
      ) {
        filledValue = variable.defaultValue;
        source = 'default';
      }

      if (filledValue !== undefined) {
        values[key] = filledValue;
      }

      previews.push({
        defaultValue: variable.defaultValue ?? null,
        description: variable.description ?? null,
        filledValue: filledValue ?? null,
        key,
        label: variable.label ?? key,
        required: Boolean(variable.required),
        source,
        type: variable.type ?? 'text',
      });
    }

    // When the template has no declared inputVariables, still pass core keys
    // so step-based templates (${topic}) can receive context.
    if (variables.length === 0) {
      values.topic = topic;
      values.prompt = prompt;
      if (brandId) {
        values.brandId = brandId;
      }
      if (overrides.referenceImage) {
        values.referenceImage = overrides.referenceImage;
      }
    }

    const missingRequiredKeys = variables
      .filter((variable) => variable.required)
      .filter((variable) => {
        const value = values[variable.key];
        return value === undefined || value === null || value === '';
      })
      .map((variable) => variable.key);

    return { missingRequiredKeys, previews, values };
  }

  private buildDefaultPrompt(
    strategy: AgentStrategyDocument,
    topic: string,
  ): string {
    const parts = [
      `Create content about: ${topic}.`,
      strategy.displayRole
        ? `Role: ${String(strategy.displayRole)}.`
        : undefined,
      strategy.voice ? `Voice: ${String(strategy.voice)}.` : undefined,
      Array.isArray(strategy.platforms) && strategy.platforms.length > 0
        ? `Platforms: ${strategy.platforms.join(', ')}.`
        : undefined,
    ].filter((part): part is string => Boolean(part));

    return parts.join(' ');
  }

  private readConfigString(
    strategy: AgentStrategyDocument,
    key: string,
  ): string | null {
    // Prefer first-class columns (preferredWorkflowId / TemplateId).
    const direct = (strategy as Record<string, unknown>)[key];
    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim();
    }

    // Legacy config bag only — migration strips these after backfill.
    const config = strategy.config;
    if (config && typeof config === 'object' && !Array.isArray(config)) {
      const value = (config as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  /**
   * Typed column `workflowInputOverrides: [{key,value}]` only.
   * Legacy free-object `workflowInputDefaults` is still read until migration.
   */
  private readWorkflowInputDefaults(
    strategy: AgentStrategyDocument,
  ): Record<string, unknown> {
    const overrides = strategy.workflowInputOverrides;
    if (Array.isArray(overrides)) {
      return overridesArrayToRecord(
        overrides as Array<{ key: string; value: string | number | boolean }>,
      );
    }

    const direct = (strategy as Record<string, unknown>).workflowInputOverrides;
    if (Array.isArray(direct)) {
      return overridesArrayToRecord(
        direct as Array<{ key: string; value: string | number | boolean }>,
      );
    }

    const config = strategy.config;
    if (config && typeof config === 'object' && !Array.isArray(config)) {
      const nested = (config as Record<string, unknown>).workflowInputDefaults;
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        return nested as Record<string, unknown>;
      }
    }

    return {};
  }

  private async persistPreferredWorkflow(
    strategy: AgentStrategyDocument,
    workflow: ResolvedWorkflow,
  ): Promise<void> {
    if (!workflow.id) {
      return;
    }

    const currentPreferred = this.readConfigString(
      strategy,
      'preferredWorkflowId',
    );
    const currentTemplate = this.readConfigString(
      strategy,
      'preferredWorkflowTemplateId',
    );

    if (
      currentPreferred === workflow.id &&
      (!workflow.templateId || currentTemplate === workflow.templateId)
    ) {
      return;
    }

    await this.agentStrategiesService.patch(String(strategy.id), {
      preferredWorkflowId: workflow.id,
      ...(workflow.templateId
        ? { preferredWorkflowTemplateId: workflow.templateId }
        : {}),
    });
  }
}

function overridesArrayToRecord(
  entries: Array<{ key: string; value: string | number | boolean }>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const entry of entries) {
    if (entry.key) {
      out[entry.key] = entry.value;
    }
  }
  return out;
}
