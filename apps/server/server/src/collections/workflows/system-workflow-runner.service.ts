import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import {
  type GenfeedActionDefinition,
  getActionDefinition,
} from '@genfeedai/actions';
import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
  WorkflowStatus,
} from '@genfeedai/enums';
import { Prisma } from '@genfeedai/prisma';
import {
  buildActionExecutionInput,
  type ExecutionContext,
} from '@genfeedai/workflows/engine';
import {
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { WorkflowEngineAdapterService } from '@server/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutorService } from '@server/collections/workflows/services/workflow-executor.service';
import type { WorkflowExecutionResult } from '@server/collections/workflows/services/workflow-executor.types';
import {
  buildHiddenSystemWorkflowMetadata,
  HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
  isHiddenSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_METADATA_KEY,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
  SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
  SYSTEM_WORKFLOW_TEMPLATE_VERSION,
} from '@server/collections/workflows/system-workflow.contract';
import {
  type RunSystemWorkflowInput,
  type SystemWorkflowGraphDefinition,
} from '@server/collections/workflows/system-workflow-definition';
import {
  buildWorkflowVersionDefinition,
  createVersionedWorkflow,
} from '@server/collections/workflows/workflow-version-definition';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

export const WORKFLOW_FOR_EACH_ACTION_ID = 'workflow.for-each';
export const WORKFLOW_FOR_EACH_TENANT_ACTION_ID = 'workflow.for-each-tenant';
export const WORKFLOW_RUN_CHILD_ACTION_ID = 'workflow.run-child';
const MAX_FOR_EACH_CONCURRENCY = 10;
const MAX_FOR_EACH_ITEMS = 500;
const MAX_FOR_EACH_DELAY_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_NESTED_WORKFLOW_DEPTH = 8;

export type SystemWorkflowProvenance = {
  executionId: string;
  idempotencyKey?: string;
  nodeId?: string;
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

export type {
  RunSystemWorkflowInput,
  SystemWorkflowGraphDefinition,
  SystemWorkflowGraphMetadata,
} from '@server/collections/workflows/system-workflow-definition';

@Injectable()
export class SystemWorkflowRunnerService
  implements OnApplicationBootstrap, OnModuleInit
{
  private readonly actionDefinitions = new Map<
    string,
    GenfeedActionDefinition
  >();
  private readonly runtimeContext = new AsyncLocalStorage<unknown>();
  private readonly workflowDepth = new AsyncLocalStorage<number>();
  private readonly workflowDefinitions = new Map<
    string,
    SystemWorkflowGraphDefinition
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit(): void {
    this.registerAction(WORKFLOW_FOR_EACH_ACTION_ID, (request) =>
      this.executeForEach(request),
    );
    this.registerAction(WORKFLOW_FOR_EACH_TENANT_ACTION_ID, (request) =>
      this.executeForEach(request, true),
    );
    this.registerAction(WORKFLOW_RUN_CHILD_ACTION_ID, (request) =>
      this.executeChild(request),
    );
  }

  onApplicationBootstrap(): void {
    const registeredActionIds = new Set(
      this.getEngineAdapter().getRegisteredActionIds(),
    );
    const missing = new Set<string>();
    const missingChildren = new Set<string>();

    for (const definition of this.workflowDefinitions.values()) {
      for (const node of definition.definition.nodes ?? []) {
        if (node.type !== 'genfeedAction') {
          continue;
        }
        const actionId = this.optionalString(
          this.readRecord(node.data?.config).actionId,
        );
        if (actionId && !registeredActionIds.has(actionId)) {
          missing.add(`${definition.canonicalId}:${actionId}`);
        }
        if (
          actionId === WORKFLOW_FOR_EACH_ACTION_ID ||
          actionId === WORKFLOW_FOR_EACH_TENANT_ACTION_ID ||
          actionId === WORKFLOW_RUN_CHILD_ACTION_ID
        ) {
          const childWorkflowId = this.optionalString(
            this.readRecord(node.data?.config).childWorkflowId,
          );
          if (
            childWorkflowId &&
            !this.workflowDefinitions.has(childWorkflowId)
          ) {
            missingChildren.add(
              `${definition.canonicalId}:${node.id}:${childWorkflowId}`,
            );
          }
        }
      }
    }

    if (missing.size > 0) {
      throw new Error(
        `System workflow action executors missing: ${[...missing].sort().join(', ')}`,
      );
    }
    if (missingChildren.size > 0) {
      throw new Error(
        `System workflow child definitions missing: ${[...missingChildren].sort().join(', ')}`,
      );
    }
  }

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
          const input = buildActionExecutionInput(node.config, inputs);
          return executor({
            context,
            input,
            provenance: {
              executionId: context.executionId ?? context.runId,
              idempotencyKey: `workflow:${context.executionId ?? context.runId}:${node.id}`,
              nodeId: node.id,
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
    this.validateDefinition(definition);
    this.workflowDefinitions.set(definition.canonicalId, definition);
  }

  async runDefinition<T>(
    definition: SystemWorkflowGraphDefinition,
    input: RunSystemWorkflowInput,
  ): Promise<{
    provenance: SystemWorkflowProvenance;
    result: T;
  }> {
    if (input.canonicalId !== definition.canonicalId) {
      throw new Error(
        `System workflow input ${input.canonicalId} does not match definition ${definition.canonicalId}`,
      );
    }
    this.validateDefinition(definition);
    this.assertDefinitionExecutors(definition);
    return this.executeDefinition<T>(definition, input);
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

  async startWorkflow(input: RunSystemWorkflowInput): Promise<{
    execution: WorkflowExecutionResult;
    provenance: SystemWorkflowProvenance;
    userId: string;
  }> {
    const definition = this.workflowDefinitions.get(input.canonicalId);
    if (!definition) {
      throw new Error(`Unknown system workflow: ${input.canonicalId}`);
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
    userId: string;
  }> {
    const userId = await this.resolveUserId(input.organizationId, input.userId);
    const workflowMirror =
      await this.ensureHiddenSystemWorkflowMirror(definition);
    const workflow = {
      ...workflowMirror,
      organizationId: input.organizationId,
      userId,
    };
    const parentDepth = this.workflowDepth.getStore() ?? 0;
    if (parentDepth >= MAX_NESTED_WORKFLOW_DEPTH) {
      throw new Error(
        `System workflow nesting exceeds ${MAX_NESTED_WORKFLOW_DEPTH} levels`,
      );
    }
    const execution = await this.workflowDepth.run(parentDepth + 1, () =>
      this.runtimeContext.run(input.runtimeContext, () =>
        this.getWorkflowExecutor().executeManualWorkflowDocument(
          workflow,
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
    return { execution, provenance, userId };
  }

  private async ensureHiddenSystemWorkflowMirror(
    definition: SystemWorkflowGraphDefinition,
  ): Promise<Prisma.WorkflowGetPayload<{ include: { currentVersion: true } }>> {
    const where = {
      isDeleted: false,
      metadata: {
        equals: definition.canonicalId,
        path: [SYSTEM_WORKFLOW_METADATA_KEY, 'canonicalId'],
      },
      organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
    } satisfies Prisma.WorkflowWhereInput;
    return this.prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`hidden-system-workflow:${definition.canonicalId}`}, 0)
          )
        `;
        const existing = await transaction.workflow.findFirst({
          include: { currentVersion: true },
          where,
        });
        if (existing) {
          if (!isHiddenSystemWorkflowMetadata(existing.metadata)) {
            throw new Error(
              `System workflow ${definition.canonicalId} collides with a non-hidden principal workflow`,
            );
          }
          const nextDefinition = buildWorkflowVersionDefinition(
            definition.definition,
          );
          const currentVersion = existing.currentVersion;
          if (!currentVersion) {
            throw new Error(
              `System workflow ${definition.canonicalId} has no immutable version pin`,
            );
          }
          if (currentVersion.contentHash === nextDefinition.contentHash) {
            return existing;
          }

          const nextVersion = await transaction.workflowVersion.create({
            data: {
              contentHash: nextDefinition.contentHash,
              graph: nextDefinition.graph as unknown as Prisma.InputJsonValue,
              inputSchema:
                nextDefinition.inputSchema as unknown as Prisma.InputJsonValue,
              organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
              userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
              version: currentVersion.version + 1,
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
          return transaction.workflow.findUniqueOrThrow({
            include: { currentVersion: true },
            where: { id: existing.id },
          });
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
              sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
              [SYSTEM_WORKFLOW_METADATA_KEY]: buildHiddenSystemWorkflowMetadata(
                {
                  canonicalId: definition.canonicalId,
                  changeSummary: definition.changeSummary,
                  version: definition.version,
                },
              ),
            },
            organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
            progress: 0,
            schedule: definition.schedule,
            status: WorkflowStatus.ACTIVE,
            timezone: 'UTC',
            userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
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

  private validateDefinition(definition: SystemWorkflowGraphDefinition): void {
    const version = buildWorkflowVersionDefinition(definition.definition);
    if (
      !version.graph.nodes.some((node) => node.id === definition.resultNodeId)
    ) {
      throw new Error(
        `System workflow ${definition.canonicalId} result node ${definition.resultNodeId} does not exist`,
      );
    }
  }

  private assertDefinitionExecutors(
    definition: SystemWorkflowGraphDefinition,
  ): void {
    const registeredActionIds = new Set(
      this.getEngineAdapter().getRegisteredActionIds(),
    );
    const missingActionIds = (definition.definition.nodes ?? []).flatMap(
      (node) => {
        if (node.type !== 'genfeedAction') {
          return [];
        }
        const actionId = this.optionalString(
          this.readRecord(node.data?.config).actionId,
        );
        return actionId && !registeredActionIds.has(actionId) ? [actionId] : [];
      },
    );
    if (missingActionIds.length > 0) {
      throw new Error(
        `System workflow action executors missing: ${[
          ...new Set(missingActionIds),
        ]
          .sort()
          .map((actionId) => `${definition.canonicalId}:${actionId}`)
          .join(', ')}`,
      );
    }
  }

  private async executeForEach(
    request: SystemWorkflowActionRequest,
    projectTenantContext = false,
  ): Promise<{
    count: number;
    results: Array<
      | {
          index: number;
          provenance: SystemWorkflowProvenance;
          result: unknown;
        }
      | { index: number; jobId: string }
    >;
  }> {
    const childWorkflowId = this.requiredString(
      request.input.childWorkflowId,
      'childWorkflowId',
    );
    const itemInputKey =
      this.optionalString(request.input.itemInputKey) ?? 'item';
    const parentNodeId =
      this.optionalString(request.provenance.nodeId) ?? 'workflow-for-each';
    const items = request.input.items;
    if (!Array.isArray(items)) {
      throw new Error('workflow.for-each requires an items array');
    }
    if (items.length > MAX_FOR_EACH_ITEMS) {
      throw new Error(
        `workflow.for-each accepts at most ${MAX_FOR_EACH_ITEMS} items`,
      );
    }
    const childContexts = await this.resolveForEachChildContexts(
      items,
      request,
      projectTenantContext,
    );
    const baseInput = this.readRecord(request.input.baseInput);
    const mode = this.optionalString(request.input.mode) ?? 'await';
    if (mode !== 'await' && mode !== 'scheduled') {
      throw new Error('workflow.for-each mode must be await or scheduled');
    }
    const interItemDelayMs =
      request.input.interItemDelayMs === undefined
        ? 0
        : this.boundedInteger(
            request.input.interItemDelayMs,
            'interItemDelayMs',
            0,
            MAX_FOR_EACH_DELAY_MS,
          );
    const initialDelayMs =
      request.input.initialDelayMs === undefined
        ? 0
        : this.boundedInteger(
            request.input.initialDelayMs,
            'initialDelayMs',
            0,
            MAX_FOR_EACH_DELAY_MS,
          );
    if (mode === 'await' && interItemDelayMs !== 0) {
      throw new Error(
        'workflow.for-each interItemDelayMs requires scheduled mode',
      );
    }
    if (mode === 'await' && initialDelayMs !== 0) {
      throw new Error(
        'workflow.for-each initialDelayMs requires scheduled mode',
      );
    }
    const finalDelayMs =
      initialDelayMs + Math.max(items.length - 1, 0) * interItemDelayMs;
    if (finalDelayMs > MAX_FOR_EACH_DELAY_MS) {
      throw new Error(
        `workflow.for-each final scheduled delay may not exceed ${MAX_FOR_EACH_DELAY_MS}ms`,
      );
    }
    const requestedConcurrency = request.input.maxConcurrency;
    const maxConcurrency =
      requestedConcurrency === undefined
        ? 1
        : this.boundedInteger(
            requestedConcurrency,
            'maxConcurrency',
            1,
            MAX_FOR_EACH_CONCURRENCY,
          );
    if (mode === 'scheduled') {
      return this.scheduleForEach({
        baseInput,
        childWorkflowId,
        initialDelayMs,
        interItemDelayMs,
        itemInputKey,
        items,
        childContexts,
        parentNodeId,
        request,
      });
    }

    const results: Array<{
      index: number;
      provenance: SystemWorkflowProvenance;
      result: unknown;
    }> = new Array(items.length);
    let cursor = 0;
    let failure: unknown;

    const worker = async (): Promise<void> => {
      while (failure === undefined) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) {
          return;
        }
        try {
          const childContext = childContexts[index];
          if (!childContext) {
            throw new Error(
              `workflow.for-each could not resolve child context for item ${index}`,
            );
          }
          const child = await this.runWorkflow<unknown>({
            actionType: childWorkflowId,
            canonicalId: childWorkflowId,
            inputValues: {
              ...baseInput,
              [itemInputKey]: items[index],
            },
            metadata: {
              parentExecutionId: request.provenance.executionId,
              parentNodeId,
              parentWorkflowId: request.provenance.workflowId,
              workflowForEachIndex: index,
            },
            organizationId: childContext.organizationId,
            runtimeContext: request.runtimeContext,
            source: `${WORKFLOW_FOR_EACH_ACTION_ID}:${request.provenance.executionId}:${parentNodeId}`,
            trigger: WorkflowExecutionTrigger.API,
            userId: childContext.userId,
          });
          results[index] = { index, ...child };
        } catch (error: unknown) {
          failure = error;
        }
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(maxConcurrency, Math.max(items.length, 1)) },
        () => worker(),
      ),
    );
    if (failure !== undefined) {
      throw failure;
    }
    return { count: results.length, results };
  }

  private async executeChild(
    request: SystemWorkflowActionRequest,
  ): Promise<unknown> {
    const childWorkflowId = this.requiredString(
      request.input.childWorkflowId,
      'childWorkflowId',
    );
    const { childWorkflowId: _childWorkflowId, ...inputValues } = request.input;
    const parentNodeId =
      this.optionalString(request.provenance.nodeId) ?? 'workflow-run-child';

    const child = await this.runWorkflow({
      actionType: childWorkflowId,
      canonicalId: childWorkflowId,
      inputValues,
      metadata: {
        parentExecutionId: request.provenance.executionId,
        parentNodeId,
        parentWorkflowId: request.provenance.workflowId,
      },
      organizationId: request.context.organizationId,
      runtimeContext: request.runtimeContext,
      source: `${WORKFLOW_RUN_CHILD_ACTION_ID}:${request.provenance.executionId}:${parentNodeId}`,
      trigger: WorkflowExecutionTrigger.API,
      userId: request.context.userId,
    });
    return child.result;
  }

  private async scheduleForEach(input: {
    baseInput: Record<string, unknown>;
    childWorkflowId: string;
    childContexts: Array<{ organizationId: string; userId: string }>;
    initialDelayMs: number;
    interItemDelayMs: number;
    itemInputKey: string;
    items: unknown[];
    parentNodeId: string;
    request: SystemWorkflowActionRequest;
  }): Promise<{
    count: number;
    results: Array<{ index: number; jobId: string }>;
  }> {
    const definition = this.workflowDefinitions.get(input.childWorkflowId);
    if (!definition) {
      throw new Error(`Unknown system workflow: ${input.childWorkflowId}`);
    }
    const jobs: Array<{ index: number; jobId: string }> = [];
    for (const [index, item] of input.items.entries()) {
      const childContext = input.childContexts[index];
      if (!childContext) {
        throw new Error(
          `workflow.for-each could not resolve child context for item ${index}`,
        );
      }
      const identity = createHash('sha256')
        .update(
          `${input.request.provenance.executionId}:${input.parentNodeId}:${input.childWorkflowId}:${index}`,
        )
        .digest('hex')
        .slice(0, 32);
      const jobId = await this.getWorkflowQueue().queueSystemWorkflow(
        {
          actionType: input.childWorkflowId,
          canonicalId: input.childWorkflowId,
          inputValues: {
            ...input.baseInput,
            [input.itemInputKey]: item,
          },
          metadata: {
            parentExecutionId: input.request.provenance.executionId,
            parentNodeId: input.parentNodeId,
            parentWorkflowId: input.request.provenance.workflowId,
            workflowForEachIndex: index,
          },
          organizationId: childContext.organizationId,
          source: `${WORKFLOW_FOR_EACH_ACTION_ID}:${input.request.provenance.executionId}:${input.parentNodeId}`,
          trigger: WorkflowExecutionTrigger.SCHEDULED,
          userId: childContext.userId,
        },
        `${WORKFLOW_FOR_EACH_ACTION_ID}-${identity}`,
        {
          delayMs: input.initialDelayMs + index * input.interItemDelayMs,
          replaceTerminalJob: true,
        },
      );
      jobs.push({ index, jobId });
    }
    return { count: jobs.length, results: jobs };
  }

  private async resolveForEachChildContexts(
    items: unknown[],
    request: SystemWorkflowActionRequest,
    projectTenantContext: boolean,
  ): Promise<Array<{ organizationId: string; userId: string }>> {
    if (!projectTenantContext) {
      return items.map(() => ({
        organizationId: request.context.organizationId,
        userId: request.context.userId,
      }));
    }

    await this.assertHiddenSystemWorkflowParent(request);
    const organizationIds = items.map((item, index) => {
      const organizationId = this.optionalString(
        this.readRecord(item).organizationId,
      );
      if (!organizationId) {
        throw new Error(
          `${WORKFLOW_FOR_EACH_TENANT_ACTION_ID} item ${index} requires organizationId`,
        );
      }
      return organizationId;
    });
    const organizations = await this.prisma.organization.findMany({
      select: { id: true, userId: true },
      where: { id: { in: [...new Set(organizationIds)] }, isDeleted: false },
    });
    const owners = new Map(
      organizations.map((organization) => [
        organization.id,
        organization.userId,
      ]),
    );

    return organizationIds.map((organizationId) => {
      const userId = owners.get(organizationId);
      if (!userId) {
        throw new Error(
          `${WORKFLOW_FOR_EACH_TENANT_ACTION_ID} organization ${organizationId} is unavailable`,
        );
      }
      return { organizationId, userId };
    });
  }

  private async assertHiddenSystemWorkflowParent(
    request: SystemWorkflowActionRequest,
  ): Promise<void> {
    const workflow = await this.prisma.workflow.findFirst({
      select: { metadata: true },
      where: {
        id: request.provenance.workflowId,
        isDeleted: false,
        organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      },
    });
    if (!isHiddenSystemWorkflowMetadata(workflow?.metadata)) {
      throw new Error(
        `${WORKFLOW_FOR_EACH_TENANT_ACTION_ID} requires a hidden system workflow parent`,
      );
    }
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

  private requiredString(value: unknown, field: string): string {
    const parsed = this.optionalString(value);
    if (!parsed) {
      throw new Error(`${field} is required`);
    }
    return parsed;
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private boundedInteger(
    value: unknown,
    field: string,
    minimum: number,
    maximum: number,
  ): number {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < minimum ||
      value > maximum
    ) {
      throw new Error(
        `${field} must be an integer from ${minimum} through ${maximum}`,
      );
    }
    return value;
  }

  private getEngineAdapter(): WorkflowEngineAdapterService {
    return this.moduleRef.get(WorkflowEngineAdapterService, { strict: false });
  }

  private getWorkflowExecutor(): WorkflowExecutorService {
    return this.moduleRef.get(WorkflowExecutorService, { strict: false });
  }

  private getWorkflowQueue(): WorkflowExecutionQueueService {
    return this.moduleRef.get(WorkflowExecutionQueueService, { strict: false });
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
