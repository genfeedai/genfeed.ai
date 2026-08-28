import { AsyncLocalStorage } from 'node:async_hooks';
import {
  createGenfeedActionNode,
  type GenfeedActionDefinition,
  getActionDefinition,
} from '@genfeedai/actions';
import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
  WorkflowStatus,
} from '@genfeedai/enums';
import { Prisma } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import type { ExecutionContext } from '@genfeedai/workflows/engine';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { WorkflowEngineAdapterService } from '@server/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowExecutorService } from '@server/collections/workflows/services/workflow-executor.service';
import type { WorkflowExecutionResult } from '@server/collections/workflows/services/workflow-executor.types';
import {
  buildSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_METADATA_KEY,
  SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
  SYSTEM_WORKFLOW_TEMPLATE_VERSION,
} from '@server/collections/workflows/system-workflow.contract';
import type { WorkflowDefinitionInput } from '@server/collections/workflows/workflow-version-definition';
import {
  buildWorkflowVersionDefinition,
  createVersionedWorkflow,
} from '@server/collections/workflows/workflow-version-definition';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

export const SYSTEM_WORKFLOW_ACTION_IDS = {
  BRAND_REMIX_PAUSED_META_DRAFT: 'brand-remix-paused-meta-draft',
  BRAND_REMIX_PAUSED_X_ADS_DRAFT: 'brand-remix-paused-x-ads-draft',
  BRAND_REMIX_REVIEW_HANDOFF: 'brand-remix-review-handoff',
  CAMPAIGN_DM_AUTOMATION: 'campaign-dm-automation',
  CAMPAIGN_REPLY_AUTOMATION: 'campaign-reply-automation',
  ENGAGEMENT_RULE_EVALUATION: 'engagement-rule-evaluation',
  EVERGREEN_RELEASE_EXPANSION: 'evergreen-release-expansion',
  REPLY_DM_AUTOMATION: 'reply-dm-automation',
  REVIEW_GATE_TIMEOUT: 'review-gate-timeout',
  RSS_SOURCE_POLL: 'rss-source-poll',
  SCHEDULED_POST_PUBLISHING: 'scheduled-post-publishing',
  SOCIAL_INBOX_POST_REPLY: 'social-inbox-post-reply',
  SOCIAL_INBOX_SEND_DM: 'social-inbox-send-dm',
  SOCIAL_REPLY_CAMPAIGN: 'social-reply-campaign',
  STREAK_MAINTENANCE: 'streak-maintenance',
  TIKTOK_STATUS_RECONCILIATION: 'tiktok-status-reconciliation',
  TWITTER_PUBLISH_ACTION: 'twitter-publish-action',
  YOUTUBE_STATUS_RECONCILIATION: 'youtube-status-reconciliation',
} as const;

export type SystemWorkflowActionId =
  (typeof SYSTEM_WORKFLOW_ACTION_IDS)[keyof typeof SYSTEM_WORKFLOW_ACTION_IDS];

export type SystemWorkflowGraphMetadata = {
  canonicalId: string;
  changeSummary?: string;
  description: string;
  label: string;
  schedule?: string;
  version?: number;
};

export type SystemWorkflowGraphDefinition = SystemWorkflowGraphMetadata & {
  definition: WorkflowDefinitionInput;
  resultNodeId: string;
};

export type SystemWorkflowProvenance = {
  executionId: string;
  workflowId: string;
  workflowLabel: string;
};

export type SystemWorkflowActionRequest = {
  context: ExecutionContext;
  input: Record<string, unknown>;
  provenance: SystemWorkflowProvenance;
  runtimeContext?: unknown;
};

export type SystemWorkflowActionExecutor = (
  request: SystemWorkflowActionRequest,
) => Promise<unknown>;

export type RunSystemWorkflowInput = {
  actionType: string;
  canonicalId: string;
  inputValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  organizationId: string;
  postIds?: string[];
  source: string;
  trigger?: WorkflowExecutionTrigger;
  userId?: string;
  runtimeContext?: unknown;
};

@Injectable()
export class SystemWorkflowRunnerService {
  private readonly actionDefinitions = new Map<
    string,
    GenfeedActionDefinition
  >();
  private readonly runtimeContext = new AsyncLocalStorage<unknown>();
  private readonly workflowDefinitions = new Map<
    string,
    SystemWorkflowGraphDefinition
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  registerAction(
    actionId: string,
    executor: SystemWorkflowActionExecutor,
  ): void {
    if (this.actionDefinitions.has(actionId)) {
      throw new Error(`Duplicate Genfeed action definition: ${actionId}`);
    }
    const definition = this.resolveDefinition(actionId);
    this.actionDefinitions.set(actionId, definition);
    try {
      this.getEngineAdapter().registerExecutor(
        actionId,
        async (node, inputs, context) => {
          const {
            inputVariableKeys: _inputVariableKeys,
            payload,
            ...config
          } = node.config;
          const input = {
            ...this.readRecord(payload),
            ...config,
            ...Object.fromEntries(inputs),
          };
          return executor({
            context,
            input,
            provenance: {
              executionId: context.executionId ?? context.runId,
              workflowId: context.workflowId,
              workflowLabel: definition.label,
            },
            runtimeContext: this.runtimeContext.getStore(),
          });
        },
      );
    } catch (error) {
      this.actionDefinitions.delete(actionId);
      throw error;
    }
  }

  registerWorkflow(definition: SystemWorkflowGraphDefinition): void {
    if (this.workflowDefinitions.has(definition.canonicalId)) {
      throw new Error(
        `Duplicate system workflow definition: ${definition.canonicalId}`,
      );
    }
    this.workflowDefinitions.set(definition.canonicalId, definition);
  }

  async runAction<T>(input: RunSystemWorkflowInput): Promise<{
    provenance: SystemWorkflowProvenance;
    result: T;
  }> {
    const actionDefinition = this.resolveDefinition(input.canonicalId);
    const definition: SystemWorkflowGraphDefinition = {
      canonicalId: actionDefinition.id,
      definition: {
        edges: [],
        inputVariables: [
          {
            key: 'payload',
            label: 'Action input',
            required: true,
            type: 'json',
          },
        ],
        nodes: [
          createGenfeedActionNode({
            actionId: actionDefinition.id,
            id: 'system-action',
            inputVariableKeys: ['payload'],
          }),
        ],
      },
      description: actionDefinition.description,
      label: actionDefinition.label,
      resultNodeId: 'system-action',
    };

    return this.executeDefinition<T>(definition, {
      ...input,
      inputValues: { payload: input.inputValues ?? {} },
    });
  }

  async runWorkflow<T>(input: RunSystemWorkflowInput): Promise<{
    provenance: SystemWorkflowProvenance;
    result: T;
  }> {
    const definition = this.workflowDefinitions.get(input.canonicalId);
    if (!definition) {
      throw new Error(`Unknown system workflow: ${input.canonicalId}`);
    }
    return this.executeDefinition<T>(definition, input);
  }

  async runWorkflowDefinition<T>(
    definition: SystemWorkflowGraphDefinition,
    input: RunSystemWorkflowInput,
  ): Promise<{
    provenance: SystemWorkflowProvenance;
    result: T;
  }> {
    if (definition.canonicalId !== input.canonicalId) {
      throw new Error(
        `System workflow definition ${definition.canonicalId} cannot execute as ${input.canonicalId}`,
      );
    }
    return this.executeDefinition<T>(definition, input);
  }

  async startWorkflowDefinition(
    definition: SystemWorkflowGraphDefinition,
    input: RunSystemWorkflowInput,
  ): Promise<{
    execution: WorkflowExecutionResult;
    provenance: SystemWorkflowProvenance;
  }> {
    if (definition.canonicalId !== input.canonicalId) {
      throw new Error(
        `System workflow definition ${definition.canonicalId} cannot execute as ${input.canonicalId}`,
      );
    }
    return this.startDefinition(definition, input);
  }

  private async executeDefinition<T>(
    definition: SystemWorkflowGraphDefinition,
    input: RunSystemWorkflowInput,
  ): Promise<{
    provenance: SystemWorkflowProvenance;
    result: T;
  }> {
    const { execution, provenance } = await this.startDefinition(
      definition,
      input,
    );

    if (execution.status !== WorkflowExecutionStatus.COMPLETED) {
      throw new Error(
        execution.error ?? `System workflow ${input.canonicalId} failed`,
      );
    }

    const actionResult = execution.nodeResults.find(
      (nodeResult) => nodeResult.nodeId === definition.resultNodeId,
    );
    if (!actionResult) {
      throw new Error(
        `System workflow ${input.canonicalId} completed without an action result`,
      );
    }
    return { provenance, result: actionResult.output as T };
  }

  private async startDefinition(
    definition: SystemWorkflowGraphDefinition,
    input: RunSystemWorkflowInput,
  ): Promise<{
    execution: WorkflowExecutionResult;
    provenance: SystemWorkflowProvenance;
  }> {
    const userId = await this.resolveUserId(input.organizationId, input.userId);
    const workflow = await this.ensureSystemWorkflow(
      definition,
      input.organizationId,
      userId,
    );
    const execution = await this.runtimeContext.run(input.runtimeContext, () =>
      this.getWorkflowExecutor().executeManualWorkflow(
        workflow.id,
        userId,
        input.organizationId,
        input.inputValues ?? {},
        {
          ...(input.metadata ?? {}),
          actionType: input.actionType,
          canonicalId: input.canonicalId,
          isSystemAction: true,
          source: input.source,
        },
        input.trigger ?? WorkflowExecutionTrigger.API,
      ),
    );
    const provenance = {
      executionId: execution.executionId,
      workflowId: workflow.id,
      workflowLabel: workflow.label ?? definition.label,
    };
    if (input.postIds?.length) {
      await this.linkPostsToExecution(
        input.postIds,
        provenance,
        input.organizationId,
      );
    }
    return { execution, provenance };
  }

  private async ensureSystemWorkflow(
    definition: SystemWorkflowGraphDefinition,
    organizationId: string,
    userId: string,
  ): Promise<{ id: string; label: string | null }> {
    const where = scopedWhere(organizationId, {
      metadata: {
        equals: definition.canonicalId,
        path: [SYSTEM_WORKFLOW_METADATA_KEY, 'canonicalId'],
      },
    });
    return this.prisma.$transaction(
      async (transaction) => {
        const existing = await transaction.workflow.findFirst({
          include: { currentVersion: true },
          where,
        });
        if (existing) {
          const nextDefinition = buildWorkflowVersionDefinition(
            definition.definition,
          );
          if (
            existing.currentVersion?.contentHash === nextDefinition.contentHash
          ) {
            return existing;
          }

          const nextVersion = await transaction.workflowVersion.create({
            data: {
              contentHash: nextDefinition.contentHash,
              graph: nextDefinition.graph as unknown as Prisma.InputJsonValue,
              inputSchema:
                nextDefinition.inputSchema as unknown as Prisma.InputJsonValue,
              organizationId,
              userId,
              version: (existing.currentVersion?.version ?? 0) + 1,
              workflowId: existing.id,
            },
          });
          const advanced = await transaction.workflow.updateMany({
            data: {
              currentVersionId: nextVersion.id,
              description: definition.description,
              label: definition.label,
              schedule: definition.schedule,
            },
            where: {
              currentVersionId: existing.currentVersionId,
              id: existing.id,
            },
          });
          if (advanced.count !== 1) {
            throw new Error(
              `System workflow ${definition.canonicalId} changed concurrently`,
            );
          }
          return { id: existing.id, label: definition.label };
        }

        return createVersionedWorkflow(
          transaction,
          {
            description: definition.description,
            executionCount: 0,
            isDeleted: false,
            isScheduleEnabled: false,
            label: definition.label,
            metadata: {
              sourceTemplateChangeSummary:
                definition.changeSummary ??
                SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
              sourceTemplateId: definition.canonicalId,
              sourceTemplateVersion:
                definition.version ?? SYSTEM_WORKFLOW_TEMPLATE_VERSION,
              sourceType: 'hidden-system-workflow',
              [SYSTEM_WORKFLOW_METADATA_KEY]: buildSystemWorkflowMetadata({
                canonicalId: definition.canonicalId,
                changeSummary: definition.changeSummary,
                version: definition.version,
              }),
            },
            organizationId,
            progress: 0,
            schedule: definition.schedule,
            status: WorkflowStatus.ACTIVE,
            timezone: 'UTC',
            userId,
          },
          definition.definition,
        );
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private resolveDefinition(actionId: string): GenfeedActionDefinition {
    const registeredDefinition = this.actionDefinitions.get(actionId);
    if (registeredDefinition) {
      return registeredDefinition;
    }
    const action = getActionDefinition(actionId);
    if (!action) {
      throw new Error(`Unknown Genfeed action: ${actionId}`);
    }
    return action;
  }

  private async linkPostsToExecution(
    postIds: string[],
    provenance: SystemWorkflowProvenance,
    organizationId: string,
  ): Promise<void> {
    await this.prisma.post.updateMany({
      data: {
        sourceWorkflowId: provenance.workflowId,
        sourceWorkflowName: provenance.workflowLabel,
        workflowExecutionId: provenance.executionId,
      },
      where: { id: { in: postIds }, organizationId },
    });
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private getEngineAdapter(): WorkflowEngineAdapterService {
    return this.moduleRef.get(WorkflowEngineAdapterService, { strict: false });
  }

  private getWorkflowExecutor(): WorkflowExecutorService {
    return this.moduleRef.get(WorkflowExecutorService, { strict: false });
  }

  private async resolveUserId(
    organizationId: string,
    userId?: string,
  ): Promise<string> {
    if (userId) {
      return userId;
    }
    const organization = await this.prisma.organization.findUnique({
      select: { userId: true },
      where: { id: organizationId },
    });
    if (!organization?.userId) {
      throw new Error(
        `Cannot resolve workflow owner for organization ${organizationId}`,
      );
    }
    return organization.userId;
  }
}
