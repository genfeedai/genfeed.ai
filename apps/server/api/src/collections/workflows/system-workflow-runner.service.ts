import {
  assertDefinitionExecutors,
  isPlatformOriginatedSource,
  requiredString,
  resolveDefinition,
  resolveInheritedDispatch,
  type SystemWorkflowActionExecutor,
  type SystemWorkflowActionRequest,
  type SystemWorkflowProvenance,
  type SystemWorkflowTerminalFailureHandler,
  validateDefinition,
} from '@api/collections/workflows/system-workflow-policy.util';
import {
  readString as optionalString,
  readRecord,
} from '@genfeedai/utils/data/extract.util';

export type {
  SystemWorkflowActionExecutor,
  SystemWorkflowActionRequest,
  SystemWorkflowProvenance,
  SystemWorkflowTerminalFailureHandler,
  SystemWorkflowTerminalFailureRequest,
} from '@api/collections/workflows/system-workflow-policy.util';

import { AsyncLocalStorage } from 'node:async_hooks';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { AGENT_CONVERSATION_WORKFLOW_IDS } from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import type { WorkflowEngineAdapterService } from '@api/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import type {
  DelayResumeJobData,
  WorkflowExecutionResult,
} from '@api/collections/workflows/services/workflow-executor.types';
import {
  getSystemWorkflowMetadata,
  isHiddenSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';
import {
  type RunSystemWorkflowInput,
  type SystemWorkflowGraphDefinition,
} from '@api/collections/workflows/system-workflow-definition';
import {
  buildForEachChildIdempotencyKey,
  executeAwaitedForEach,
  type ForEachChildContext,
  parseForEachOptions,
  scheduleForEach,
  WORKFLOW_FOR_EACH_ACTION_ID,
} from '@api/collections/workflows/system-workflow-for-each.util';
import { ensureHiddenSystemWorkflowMirror } from '@api/collections/workflows/system-workflow-mirror.util';
import { assertReservedSystemActionAdmission } from '@api/collections/workflows/utils/reserved-system-action-admission.util';
import {
  WORKFLOW_ENGINE_ADAPTER,
  WORKFLOW_EXECUTOR,
} from '@api/collections/workflows/workflows.tokens';
import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import {
  getOrganizationModuleExecutionContext,
  runWithOrganizationModule,
} from '@api/common/organization-modules/organization-module-execution.context';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { type GenfeedActionDefinition } from '@genfeedai/actions';
import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
} from '@genfeedai/contracts';
import { ORGANIZATION_MODULES } from '@genfeedai/contracts/constants';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { Prisma } from '@genfeedai/prisma';
import { buildActionExecutionInput } from '@genfeedai/workflows/engine';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import {
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

export { WORKFLOW_FOR_EACH_ACTION_ID };
export const WORKFLOW_FOR_EACH_TENANT_ACTION_ID = 'workflow.for-each-tenant';
export const WORKFLOW_RUN_CHILD_ACTION_ID = 'workflow.run-child';
const MAX_NESTED_WORKFLOW_DEPTH = 8;

export type {
  RunSystemWorkflowInput,
  SystemWorkflowGraphDefinition,
  SystemWorkflowGraphMetadata,
} from '@api/collections/workflows/system-workflow-definition';

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
  private readonly moduleCompletionNodes = new AsyncLocalStorage<
    ReadonlySet<string>
  >();
  private readonly terminalFailureHandlers = new Map<
    string,
    SystemWorkflowTerminalFailureHandler
  >();
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
    const missingCompensations = new Set<string>();

    for (const definition of this.workflowDefinitions.values()) {
      const failureId = definition.failureWorkflowCanonicalId;
      if (failureId && !this.workflowDefinitions.has(failureId)) {
        missingCompensations.add(`${definition.canonicalId}:${failureId}`);
      }
      for (const node of definition.definition.nodes) {
        if (node.type !== 'genfeedAction') {
          continue;
        }
        const actionId = optionalString(readRecord(node.data?.config).actionId);
        if (actionId && !registeredActionIds.has(actionId)) {
          missing.add(`${definition.canonicalId}:${actionId}`);
        }
        if (
          actionId === WORKFLOW_FOR_EACH_ACTION_ID ||
          actionId === WORKFLOW_FOR_EACH_TENANT_ACTION_ID ||
          actionId === WORKFLOW_RUN_CHILD_ACTION_ID
        ) {
          // Node configs nest authored values under `parameters`
          // (`createGenfeedActionNode`). Reading the child id off the config
          // root left this fail-closed guard permanently satisfied.
          const childWorkflowId = optionalString(
            readRecord(readRecord(node.data?.config).parameters)
              .childWorkflowId,
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
    if (missingCompensations.size > 0) {
      throw new Error(
        `System workflow failure definitions missing: ${[...missingCompensations].sort().join(', ')}`,
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
    const definition = resolveDefinition(this.actionDefinitions, actionId);
    this.actionDefinitions.set(actionId, definition);
    try {
      this.getEngineAdapter().registerExecutor(
        actionId,
        async (node, inputs, context) => {
          await assertReservedSystemActionAdmission(
            this.prisma,
            this.workflowDefinitions,
            { actionId, nodeId: node.id, context },
          );
          const moduleContext = getOrganizationModuleExecutionContext();
          if (moduleContext) {
            if (moduleContext.organizationId !== context.organizationId) {
              throw new Error(
                'System action module context does not match its tenant',
              );
            }
            if (
              !this.moduleCompletionNodes
                .getStore()
                ?.has(`${node.id}:${actionId}`)
            ) {
              await this.getModuleAccess().assertAccess(
                moduleContext.organizationId,
                moduleContext.moduleId,
              );
            }
          }
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

  getWorkflow(canonicalId: string): SystemWorkflowGraphDefinition | undefined {
    return this.workflowDefinitions.get(canonicalId);
  }

  /** Resolve trusted terminal compensation for both new and legacy queue jobs. */
  getRegisteredFailureWorkflow(
    input: Pick<RunSystemWorkflowInput, 'canonicalId' | 'inputValues'>,
  ): { canonicalId: string; inputValues: Record<string, unknown> } | undefined {
    const canonicalId = this.workflowDefinitions.get(
      input.canonicalId,
    )?.failureWorkflowCanonicalId;
    if (!canonicalId) return undefined;
    if (!this.workflowDefinitions.has(canonicalId)) {
      throw new Error(
        `System workflow failure definitions missing: ${input.canonicalId}:${canonicalId}`,
      );
    }
    return { canonicalId, inputValues: input.inputValues ?? {} };
  }

  /**
   * Register the last resort for a workflow that owns a record: when the
   * workflow and its failure workflow both fail, the record is still marked
   * terminal instead of staying in flight forever (#6655).
   */
  registerTerminalFailure(
    canonicalId: string,
    handler: SystemWorkflowTerminalFailureHandler,
  ): void {
    if (this.terminalFailureHandlers.has(canonicalId)) {
      throw new Error(
        `Duplicate system workflow terminal failure handler: ${canonicalId}`,
      );
    }
    this.terminalFailureHandlers.set(canonicalId, handler);
  }

  /** Returns whether a registered last resort settled the owned record. */
  async settleTerminalFailure(
    input: Pick<
      RunSystemWorkflowInput,
      'canonicalId' | 'inputValues' | 'organizationId'
    >,
    workflowError: string,
  ): Promise<boolean> {
    const handler = this.terminalFailureHandlers.get(input.canonicalId);
    if (!handler) {
      return false;
    }
    await handler({
      inputValues: input.inputValues ?? {},
      organizationId: input.organizationId,
      workflowError,
    });
    return true;
  }

  registerWorkflow(definition: SystemWorkflowGraphDefinition): void {
    if (this.workflowDefinitions.has(definition.canonicalId)) {
      throw new Error(
        `Duplicate system workflow definition: ${definition.canonicalId}`,
      );
    }
    validateDefinition(definition);
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
    validateDefinition(definition);
    assertDefinitionExecutors(
      definition,
      this.getEngineAdapter().getRegisteredActionIds(),
    );
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

  async enqueueWorkflow(
    input: Omit<RunSystemWorkflowInput, 'runtimeContext'>,
    options: { dispatchClass: SystemWorkflowDispatchClass },
  ): Promise<{ executionId: string; status: WorkflowExecutionStatus }> {
    const definition = this.workflowDefinitions.get(input.canonicalId);
    if (!definition) {
      throw new Error(`Unknown system workflow: ${input.canonicalId}`);
    }
    return this.runWithDefinitionModule(definition, input.organizationId, () =>
      this.enqueueAdmittedWorkflow(definition, input, options),
    );
  }

  /** Also used for old queue jobs that resume an existing execution directly. */
  async runWithRegisteredWorkflowModule<T>(
    input: Pick<RunSystemWorkflowInput, 'canonicalId' | 'organizationId'>,
    work: () => Promise<T>,
  ): Promise<T> {
    const definition = this.workflowDefinitions.get(input.canonicalId);
    if (!definition) {
      throw new Error(`Unknown system workflow: ${input.canonicalId}`);
    }
    return this.runWithDefinitionModule(definition, input.organizationId, work);
  }

  /** Bind old delayed jobs to their tenant's actual immutable execution pin. */
  async runWithStoredWorkflowModule<T>(
    input: Pick<
      DelayResumeJobData,
      'executionId' | 'organizationId' | 'workflowId'
    >,
    work: () => Promise<T>,
  ): Promise<T> {
    if (
      !input.executionId?.trim() ||
      !input.organizationId?.trim() ||
      !input.workflowId?.trim()
    ) {
      throw new Error(
        'Stored workflow module admission requires execution ownership',
      );
    }
    const execution = await this.prisma.workflowExecution.findFirst({
      where: {
        id: input.executionId,
        isDeleted: false,
        organizationId: input.organizationId,
        workflowId: input.workflowId,
      },
      select: {
        workflowVersion: {
          select: {
            organizationId: true,
            userId: true,
            workflowId: true,
            workflow: {
              select: {
                id: true,
                isDeleted: true,
                metadata: true,
                organizationId: true,
                userId: true,
              },
            },
          },
        },
      },
    });
    const version = execution?.workflowVersion;
    const workflow = version?.workflow;
    if (
      !version ||
      !workflow ||
      workflow.isDeleted ||
      version.workflowId !== input.workflowId ||
      workflow.id !== input.workflowId ||
      version.organizationId !== workflow.organizationId ||
      version.userId !== workflow.userId
    ) {
      throw new Error('Stored workflow module ownership is unavailable');
    }
    if (
      workflow.organizationId === input.organizationId &&
      workflow.organizationId !== SYSTEM_WORKFLOW_PRINCIPAL_ID
    ) {
      // A tenant-authored or duplicated graph remains Automation even if its
      // editable metadata imitates a hidden system graph or a credit-only module.
      await this.getModuleAccess().assertAccess(
        input.organizationId,
        'automation',
      );
      return runWithOrganizationModule(
        { organizationId: input.organizationId, moduleId: 'automation' },
        () => this.moduleCompletionNodes.run(new Set(), work),
      );
    }
    if (
      workflow.organizationId !== SYSTEM_WORKFLOW_PRINCIPAL_ID ||
      workflow.userId !== SYSTEM_WORKFLOW_PRINCIPAL_ID ||
      !isHiddenSystemWorkflowMetadata(workflow.metadata)
    ) {
      throw new Error('Stored workflow module ownership is unavailable');
    }
    const metadata = getSystemWorkflowMetadata(workflow.metadata);
    if (!metadata)
      throw new Error('Stored workflow module ownership is unavailable');
    return this.runWithRegisteredWorkflowModule(
      {
        canonicalId: metadata.canonicalId,
        organizationId: input.organizationId,
      },
      work,
    );
  }

  private async runWithDefinitionModule<T>(
    definition: SystemWorkflowGraphDefinition,
    organizationId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const moduleId = definition.organizationModule;
    if (!moduleId) return this.moduleCompletionNodes.run(new Set(), work);
    if (!Object.hasOwn(ORGANIZATION_MODULES, moduleId)) {
      throw new Error('Invalid code-owned system workflow module');
    }
    await this.getModuleAccess().assertAccess(organizationId, moduleId);
    return runWithOrganizationModule({ organizationId, moduleId }, () =>
      this.moduleCompletionNodes.run(
        new Set(
          definition.definition.nodes
            .filter((node) =>
              definition.moduleCompletionNodeIds?.includes(node.id),
            )
            .map(
              (node) => `${node.id}:${readRecord(node.data?.config).actionId}`,
            ),
        ),
        work,
      ),
    );
  }

  private async enqueueAdmittedWorkflow(
    definition: SystemWorkflowGraphDefinition,
    input: Omit<RunSystemWorkflowInput, 'runtimeContext'>,
    options: { dispatchClass: SystemWorkflowDispatchClass },
  ): Promise<{ executionId: string; status: WorkflowExecutionStatus }> {
    const failureWorkflow = this.getRegisteredFailureWorkflow(input);
    const userId = await this.resolveUserId(input.organizationId, input.userId);
    const workflow = await this.ensureHiddenSystemWorkflowMirror(definition);
    if (!workflow.currentVersion) {
      throw new Error(
        `System workflow ${input.canonicalId} has no immutable version pin`,
      );
    }
    const trigger = input.trigger ?? WorkflowExecutionTrigger.API;
    const execution = await this.getWorkflowExecutions().createExecution(
      userId,
      input.organizationId,
      {
        ...(definition.generationAdmission
          ? {
              admission: {
                apiKeyId: input.apiKeyId,
                actorScopes: input.actorScopes,
                systemWorkflowCanonicalId: definition.canonicalId,
                selection: { mode: 'full' as const, respectLocks: true },
                trigger: {
                  type: 'api',
                  platform: input.source,
                  data: input.inputValues ?? {},
                },
              },
            }
          : {}),
        idempotencyKey: input.idempotencyKey,
        inputValues: input.inputValues ?? {},
        metadata: {
          ...(input.metadata ?? {}),
          actionType: input.actionType,
          canonicalId: input.canonicalId,
          // Persisted so `executeForEach` can route a `workflow.for-each`
          // node's `scheduled`-mode children by the class of the parent that
          // actually dispatched this run, instead of inferring it from the
          // workflow's canonical id (#5271) — see `resolveInheritedDispatch`.
          dispatchClass: options.dispatchClass,
          isSystemAction: true,
          source: input.source,
        },
        totalNodes: definition.definition.nodes.length,
        trigger,
        workflowId: workflow.id,
        workflowVersionId: workflow.currentVersion.id,
      },
    );

    try {
      const isAgentConversation = AGENT_CONVERSATION_WORKFLOW_IDS.includes(
        input.canonicalId,
      );
      await this.getWorkflowQueue().queueSystemWorkflow(
        { ...input, trigger, userId },
        `system-workflow-${execution.id}`,
        {
          // A terminal agent turn can contain completed mutations; retry is an explicit new turn.
          ...(isAgentConversation ? { attempts: 1 } : {}),
          dispatchClass: options.dispatchClass,
          ...(failureWorkflow ? { failureWorkflow } : {}),
          ...(isPlatformOriginatedSource(input.source)
            ? { usePlatformQueue: true }
            : {}),
          priorExecution: {
            executionId: execution.id,
            status: WorkflowExecutionStatus.PENDING,
            userId,
            workflowId: workflow.id,
            workflowLabel: workflow.label ?? definition.label,
          },
        },
      );
    } catch (error: unknown) {
      await this.getWorkflowExecutions().completeExecution(
        execution.id,
        input.organizationId,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }

    return {
      executionId: execution.id,
      status: WorkflowExecutionStatus.PENDING,
    };
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
    if (definition.generationAdmission) {
      throw new Error(
        'Funded system generation must use queued execution admission',
      );
    }
    return this.runWithDefinitionModule(definition, input.organizationId, () =>
      this.startAdmittedDefinition(definition, input),
    );
  }

  private async startAdmittedDefinition(
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

  private ensureHiddenSystemWorkflowMirror(
    definition: SystemWorkflowGraphDefinition,
  ): Promise<Prisma.WorkflowGetPayload<{ include: { currentVersion: true } }>> {
    return ensureHiddenSystemWorkflowMirror(this.prisma, definition);
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
      | {
          error: string;
          executionId?: string;
          index: number;
          status: 'failed';
        }
    >;
  }> {
    const options = parseForEachOptions(request.input);
    const parentNodeId =
      optionalString(request.provenance.nodeId) ?? 'workflow-for-each';
    const childContexts = await this.resolveForEachChildContexts(
      options.items,
      request,
      projectTenantContext,
    );

    if (options.mode === 'scheduled') {
      if (!this.workflowDefinitions.has(options.childWorkflowId)) {
        throw new Error(`Unknown system workflow: ${options.childWorkflowId}`);
      }
      // #5271 (following up on #5162/#5252 review): a for-each fanned out
      // from a background or platform-sweep run must keep its children off
      // the interactive queue too, or the parent starves interactive turns
      // one level removed from its own top-level dispatch instead of
      // directly. Routed by the PARENT EXECUTION's own persisted dispatch —
      // not by the workflow's canonical id — so a future interactive
      // re-dispatch of, say, analytics-sync correctly keeps its children
      // interactive too, instead of always landing on the platform queue.
      const inheritedDispatch = await resolveInheritedDispatch(
        this.prisma,
        request.provenance.executionId,
        request.context.organizationId,
      );
      return scheduleForEach({
        childContexts,
        options,
        parentNodeId,
        queueSystemWorkflow: (workflow, jobId, queueOptions) =>
          this.runWithRegisteredWorkflowModule(workflow, () =>
            this.getWorkflowQueue().queueSystemWorkflow(workflow, jobId, {
              ...queueOptions,
              dispatchClass: inheritedDispatch.dispatchClass,
              ...(inheritedDispatch.usePlatformQueue
                ? { usePlatformQueue: true }
                : {}),
            }),
          ),
        request,
      });
    }

    return executeAwaitedForEach({
      childContexts,
      failureMode: options.failureMode,
      items: options.items,
      maxConcurrency: options.maxConcurrency,
      executeItem: async (index, childContext) => {
        const childInputValues = {
          ...options.baseInput,
          [options.itemInputKey]: options.items[index],
        };
        const childMetadata = {
          ...(options.childWorkflowVersionId
            ? { childWorkflowVersionId: options.childWorkflowVersionId }
            : {}),
          parentExecutionId: request.provenance.executionId,
          parentNodeId,
          parentWorkflowId: request.provenance.workflowId,
          workflowForEachIndex: index,
        };
        if (options.childWorkflowVersionId) {
          return this.executePinnedChildWorkflow({
            childWorkflowId: options.childWorkflowId,
            childWorkflowVersionId: options.childWorkflowVersionId,
            idempotencyKey: buildForEachChildIdempotencyKey({
              childWorkflowVersionId: options.childWorkflowVersionId,
              index,
              parentExecutionId: request.provenance.executionId,
              parentNodeId,
            }),
            inputValues: childInputValues,
            metadata: childMetadata,
            organizationId: childContext.organizationId,
            userId: childContext.userId,
          });
        }
        return this.runWorkflow<unknown>({
          actionType: options.childWorkflowId,
          canonicalId: options.childWorkflowId,
          inputValues: childInputValues,
          metadata: childMetadata,
          organizationId: childContext.organizationId,
          runtimeContext: request.runtimeContext,
          source: `${WORKFLOW_FOR_EACH_ACTION_ID}:${request.provenance.executionId}:${parentNodeId}`,
          trigger: WorkflowExecutionTrigger.API,
          userId: childContext.userId,
        });
      },
    });
  }
  private async executePinnedChildWorkflow(input: {
    childWorkflowId: string;
    childWorkflowVersionId: string;
    idempotencyKey: string;
    inputValues: Record<string, unknown>;
    metadata: Record<string, unknown>;
    organizationId: string;
    userId: string;
  }): Promise<{
    provenance: SystemWorkflowProvenance;
    result: unknown;
  }> {
    const { execution, workflowLabel } =
      await this.getWorkflowExecutor().executePinnedManualWorkflow(
        input.childWorkflowId,
        input.childWorkflowVersionId,
        input.userId,
        input.organizationId,
        input.inputValues,
        input.metadata,
        input.idempotencyKey,
      );
    if (execution.status !== WorkflowExecutionStatus.COMPLETED) {
      const error = new Error(
        execution.error ??
          `Workflow ${input.childWorkflowId} version ${input.childWorkflowVersionId} failed`,
      );
      Object.assign(error, { workflowExecutionId: execution.executionId });
      throw error;
    }
    return {
      provenance: {
        executionId: execution.executionId,
        workflowId: input.childWorkflowId,
        workflowLabel,
      },
      result: this.resolvePinnedChildResult(execution),
    };
  }

  private resolvePinnedChildResult(
    execution: WorkflowExecutionResult,
  ): unknown {
    for (const nodeResult of [...execution.nodeResults].reverse()) {
      if (nodeResult.output !== undefined) {
        return nodeResult.output;
      }
    }
    return {};
  }

  private async executeChild(
    request: SystemWorkflowActionRequest,
  ): Promise<unknown> {
    const childWorkflowId = requiredString(
      request.input.childWorkflowId,
      'childWorkflowId',
    );
    const { childWorkflowId: _childWorkflowId, ...inputValues } = request.input;
    const parentNodeId =
      optionalString(request.provenance.nodeId) ?? 'workflow-run-child';

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

  private async resolveForEachChildContexts(
    items: unknown[],
    request: SystemWorkflowActionRequest,
    projectTenantContext: boolean,
  ): Promise<ForEachChildContext[]> {
    if (!projectTenantContext) {
      return items.map(() => ({
        organizationId: request.context.organizationId,
        userId: request.context.userId,
      }));
    }

    await this.assertHiddenSystemWorkflowParent(request);
    const organizationIds = items.map((item, index) => {
      const organizationId = optionalString(readRecord(item).organizationId);
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
    // The parent is a hidden system workflow owned by the system principal.
    const workflow = await crossOrgUnsafe(
      async () =>
        await this.prisma.workflow.findFirst({
          select: { metadata: true },
          where: {
            id: request.provenance.workflowId,
            isDeleted: false,
            organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
            userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          },
        }),
    );
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
      where: {
        id: { in: postIds },
        isDeleted: false,
        organizationId: organizationId,
      },
    });
  }

  private getEngineAdapter(): WorkflowEngineAdapterService {
    return this.moduleRef.get<WorkflowEngineAdapterService>(
      WORKFLOW_ENGINE_ADAPTER,
      {
        strict: false,
      },
    );
  }

  private getWorkflowExecutor(): WorkflowExecutorService {
    return this.moduleRef.get<WorkflowExecutorService>(WORKFLOW_EXECUTOR, {
      strict: false,
    });
  }

  private getWorkflowQueue(): WorkflowExecutionQueueService {
    return this.moduleRef.get(WorkflowExecutionQueueService, { strict: false });
  }

  private getModuleAccess(): OrganizationModuleAccessService {
    return this.moduleRef.get(OrganizationModuleAccessService, {
      strict: false,
    });
  }

  private getWorkflowExecutions(): WorkflowExecutionsService {
    return this.moduleRef.get(WorkflowExecutionsService, { strict: false });
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
