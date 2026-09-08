import { createHash, randomUUID } from 'node:crypto';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type {
  AgentWorkObjectScope,
  AgentWorkObjectState,
} from '@api/services/agent-orchestrator/tools/agent-work-object.interface';
import { AgentSourceIngestService } from '@api/services/agent-source-ingest/agent-source-ingest.service';
import { ContentQualityScorerService } from '@api/services/content-quality/content-quality-scorer.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { createLibraryAssetRoute } from '@genfeedai/contracts/constants';
import type {
  AgentSessionAsset,
  AgentWorkObject,
  AgentWorkObjectActionPayload,
  AgentWorkObjectCollection,
  AgentWorkObjectMaterial,
} from '@genfeedai/contracts/interfaces';
import { toPrismaJson } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new BadRequestException(`${label} is required.`);
  return value.trim();
}

@Injectable()
export class AgentWorkObjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: AgentStreamPublisherService,
    private readonly scorer: ContentQualityScorerService,
    private readonly executions: WorkflowExecutionsService,
    private readonly sourceIngest: AgentSourceIngestService,
  ) {}

  private async thread(scope: AgentWorkObjectScope) {
    const thread = await this.prisma.agentThread.findFirst({
      where: {
        id: scope.threadId,
        organizationId: scope.organizationId,
        userId: scope.userId,
        brandId: scope.brandId ?? null,
        isDeleted: false,
      },
    });
    if (!thread)
      throw new NotFoundException('Thread not found in the current brand.');
    return thread;
  }

  private where(scope: AgentWorkObjectScope) {
    return {
      organizationId: scope.organizationId,
      brandId: scope.brandId ?? null,
      isDeleted: false,
    };
  }

  private async members(scope: AgentWorkObjectScope) {
    const thread = await this.thread(scope);
    const ids = record(thread.config).sessionIngredientIds;
    return Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === 'string')
      : [];
  }

  private async attach(scope: AgentWorkObjectScope, ingredientId: string) {
    await this.prisma.$transaction(
      async (tx) => {
        const thread = await tx.agentThread.findFirst({
          where: {
            id: scope.threadId,
            userId: scope.userId,
            ...this.where(scope),
          },
        });
        if (!thread) throw new NotFoundException('Thread not found.');
        const config = record(thread.config);
        const ids = Array.isArray(config.sessionIngredientIds)
          ? config.sessionIngredientIds
          : [];
        await tx.agentThread.update({
          where: { id: thread.id, ...this.where(scope) },
          data: {
            config: toPrismaJson({
              ...config,
              sessionIngredientIds: [...new Set([...ids, ingredientId])],
            }),
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async list(
    scope: AgentWorkObjectScope,
    sessionId: string,
  ): Promise<AgentWorkObjectCollection> {
    const ids = await this.members(scope);
    const ingredients = await this.prisma.ingredient.findMany({
      where: { id: { in: ids }, ...this.where(scope) },
      include: { metadata: true },
      orderBy: { createdAt: 'asc' },
    });
    const workObjects: AgentWorkObject[] = [];
    const sessionAssets: AgentSessionAsset[] = [];
    for (const ingredient of ingredients) {
      const data = record(ingredient.providerData);
      const work = record(
        data.agentWorkObject,
      ) as unknown as AgentWorkObjectState;
      const href = createLibraryAssetRoute(
        ingredient.category.toLowerCase(),
        ingredient.id,
      );
      if (
        work.threadId === scope.threadId &&
        ['table', 'script', 'brief'].includes(work.kind)
      ) {
        if (work.reviewStatus === 'reviewing' && work.reviewExecutionId) {
          const execution = await this.prisma.workflowExecution.findFirst({
            where: {
              id: work.reviewExecutionId,
              organizationId: scope.organizationId,
              userId: scope.userId,
              isDeleted: false,
            },
          });
          if (
            execution &&
            ['FAILED', 'CANCELLED'].includes(
              String(execution.status).toUpperCase(),
            )
          ) {
            work.reviewStatus = 'failed';
            work.reviewError =
              'The review stopped before finishing. Retry or explicitly skip.';
          }
        }
        workObjects.push({
          id: ingredient.id,
          kind: work.kind,
          title: work.title,
          body: work.body,
          columns: work.columns,
          rows: work.rows,
          rowCount: work.rows?.length ?? 0,
          revision: ingredient.version,
          viewedInSession:
            !!sessionId &&
            work.viewedSessionId === sessionId &&
            work.viewedRevision === ingredient.version,
          reviewStatus: work.reviewStatus,
          reviewError: work.reviewError,
          href: createLibraryAssetRoute('ingredient', ingredient.id),
          reference: {
            kind: 'ingredient',
            serializer: 'ingredient',
            recordId: ingredient.id,
            organizationId: scope.organizationId,
            brandId: scope.brandId,
            recordVersion: String(ingredient.version),
          },
        });
      } else if (
        ingredient.cdnUrl &&
        ['VIDEO', 'AUDIO', 'MUSIC', 'IMAGE'].includes(ingredient.category)
      ) {
        const kind =
          ingredient.category === 'VIDEO'
            ? 'video'
            : ['AUDIO', 'MUSIC'].includes(ingredient.category)
              ? 'audio'
              : 'image';
        sessionAssets.push({
          ingredientId: ingredient.id,
          kind,
          title: ingredient.metadata?.label ?? 'Source media',
          url: ingredient.cdnUrl,
          href,
          duration: ingredient.metadata?.duration || undefined,
          width: ingredient.metadata?.width || undefined,
          height: ingredient.metadata?.height || undefined,
        });
      }
    }
    return { workObjects, sessionAssets };
  }

  async present(
    params: Record<string, unknown>,
    context: ToolExecutionContext,
  ) {
    const scope = this.scope(context);
    await this.thread(scope);
    const material = this.material(params);
    const sourceActionId = requiredString(params.objectKey, 'objectKey');
    const existing = await this.prisma.ingredient.findFirst({
      where: {
        ...this.where(scope),
        sourceActionId: `work:${scope.threadId}:${sourceActionId}`,
      },
    });
    if (existing) {
      await this.attach(scope, existing.id);
      return {
        creditsUsed: 0,
        success: true,
        data: { workObjectId: existing.id },
      };
    }
    const hash = createHash('sha256')
      .update(
        `work:${scope.organizationId}:${scope.threadId}:${sourceActionId}`,
      )
      .digest('hex');
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    const ingredient = await this.prisma.ingredient.upsert({
      where: { id, ...this.where(scope) },
      update: {},
      create: {
        id,
        ...this.where(scope),
        userId: scope.userId,
        category: 'TEXT',
        status: 'DRAFT',
        sourceActionId: `work:${scope.threadId}:${sourceActionId}`,
        providerData: toPrismaJson({
          agentWorkObject: {
            ...material,
            threadId: scope.threadId,
            reviewStatus: 'pending',
          },
        }),
        generationPrompt: material.body ?? JSON.stringify(material.rows),
      },
    });
    await this.attach(scope, ingredient.id);
    await this.publisher.publishWorkEvent({
      event: 'input_requested',
      label: material.title,
      status: 'pending',
      threadId: scope.threadId,
      userId: scope.userId,
    });
    return {
      creditsUsed: 0,
      success: true,
      data: {
        workObjectId: ingredient.id,
        message: 'The work is ready to edit and review before generation.',
      },
    };
  }

  execute(
    toolName: string,
    params: Record<string, unknown>,
    context: ToolExecutionContext,
  ) {
    switch (toolName) {
      case 'request_input':
        return this.requestInput(params, context);
      case 'present_work_object':
        return this.present(params, context);
      case 'ingest_source_media':
        return this.ingest(params, context);
      default:
        throw new BadRequestException('Unsupported structured tool.');
    }
  }

  async requestInput(
    params: Record<string, unknown>,
    context: ToolExecutionContext,
  ) {
    const scope = this.scope(context);
    await this.thread(scope);
    const options = Array.isArray(params.options)
      ? params.options.map((value) => {
          const option = record(value);
          return {
            id: requiredString(option.id, 'option id'),
            label: requiredString(option.label, 'option label'),
            ...(typeof option.description === 'string'
              ? { description: option.description }
              : {}),
          };
        })
      : [];
    if (
      options.length > 5 ||
      new Set(options.map((option) => option.id)).size !== options.length
    )
      throw new BadRequestException(
        'Use at most five uniquely identified choices.',
      );
    const recommendedOptionId =
      typeof params.recommendedOptionId === 'string'
        ? params.recommendedOptionId
        : undefined;
    if (
      recommendedOptionId &&
      !options.some((option) => option.id === recommendedOptionId)
    )
      throw new BadRequestException(
        'The recommendation must be one of the choices.',
      );
    const inputRequestId = requiredString(params.requestId, 'requestId');
    await this.publisher.publishInputRequest({
      inputRequestId,
      threadId: scope.threadId,
      userId: scope.userId,
      runId: context.runId,
      title: requiredString(params.title, 'title'),
      prompt: requiredString(params.prompt, 'prompt'),
      allowFreeText: true,
      options,
      recommendedOptionId,
      metadata: {
        kind: 'consequential',
        brandId: scope.brandId,
        contextVersion: context.validatedScope?.contextVersion,
      },
    });
    return {
      creditsUsed: 0,
      success: true,
      data: {
        inputRequestId,
        waitingForInput: true,
        message:
          'Wait for the operator to answer before continuing or generating.',
      },
    };
  }

  async ingest(params: Record<string, unknown>, context: ToolExecutionContext) {
    const scope = this.scope(context);
    await this.thread(scope);
    const kind =
      params.kind === 'video' ||
      params.kind === 'audio' ||
      params.kind === 'image'
        ? params.kind
        : undefined;
    let ingredientId: string;
    try {
      ({ ingredientId } = await this.sourceIngest.ingest(
        {
          ingredientId:
            typeof params.ingredientId === 'string'
              ? params.ingredientId
              : undefined,
          url: typeof params.url === 'string' ? params.url : undefined,
          title: typeof params.title === 'string' ? params.title : undefined,
          kind,
        },
        scope,
      ));
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : 'The source could not be imported.';
      await this.publisher.publishInputRequest({
        inputRequestId: `source-retry:${scope.threadId}:${context.runId ?? randomUUID()}`,
        threadId: scope.threadId,
        userId: scope.userId,
        runId: context.runId,
        title: 'Source needs attention',
        prompt: `${detail} Retry this source or paste another URL.`,
        allowFreeText: true,
        options: [{ id: 'retry', label: 'Retry this source' }],
        metadata: { kind: 'ingest', brandId: scope.brandId, error: detail },
      });
      return {
        success: false,
        creditsUsed: 0,
        error: detail,
        data: { waitingForInput: true },
      };
    }
    await this.attach(scope, ingredientId);
    await this.publisher.publishWorkEvent({
      event: 'tool_completed',
      label: 'Source added to Library',
      status: 'completed',
      threadId: scope.threadId,
      userId: scope.userId,
      runId: context.runId,
    });
    return {
      creditsUsed: 0,
      success: true,
      data: {
        ingredientId: ingredientId,
        message: 'Source added to this session from Library.',
      },
    };
  }

  private material(params: Record<string, unknown>): AgentWorkObjectMaterial {
    const kind = params.kind;
    if (kind !== 'table' && kind !== 'script' && kind !== 'brief')
      throw new BadRequestException('Choose table, script, or brief.');
    const title = requiredString(params.title, 'title').slice(0, 200);
    const body = typeof params.body === 'string' ? params.body : undefined;
    const columns = Array.isArray(params.columns)
      ? params.columns.map((value) => {
          const column = record(value);
          return {
            key: requiredString(column.key, 'column key'),
            label: requiredString(column.label, 'column label'),
          };
        })
      : undefined;
    const rows = Array.isArray(params.rows)
      ? params.rows.map((value) => {
          const row = record(value);
          if (Object.values(row).some((cell) => typeof cell !== 'string'))
            throw new BadRequestException('Work cells must contain text.');
          return row as Record<string, string>;
        })
      : undefined;
    if (!body?.trim() && !rows?.length)
      throw new BadRequestException(
        'The work object must contain a body or rows.',
      );
    if ((rows?.length ?? 0) > 500 || (body?.length ?? 0) > 100000)
      throw new BadRequestException('Work object is too large.');
    if (rows?.length) {
      const keys = new Set(columns?.map((column) => column.key) ?? []);
      if (!keys.size || keys.size !== columns?.length)
        throw new BadRequestException('Rows require unique column keys.');
      if (rows.some((row) => Object.keys(row).some((key) => !keys.has(key))))
        throw new BadRequestException(
          'Each cell must match a declared column.',
        );
    }
    return { kind, title, body, columns, rows };
  }

  private async load(scope: AgentWorkObjectScope, id: string) {
    if (!(await this.members(scope)).includes(id))
      throw new NotFoundException('Work object is not in this thread.');
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id, ...this.where(scope) },
    });
    const work = record(
      record(ingredient?.providerData).agentWorkObject,
    ) as unknown as AgentWorkObjectState;
    if (!ingredient || work.threadId !== scope.threadId)
      throw new NotFoundException('Work object not found.');
    return { ingredient, work };
  }

  async action(
    scope: AgentWorkObjectScope,
    id: string,
    payload: AgentWorkObjectActionPayload,
  ): Promise<string | undefined> {
    requiredString(payload.sessionId, 'sessionId');
    const { ingredient, work } = await this.load(scope, id);
    if (ingredient.version !== payload.revision)
      throw new ConflictException(
        'This work changed. Reload it before continuing.',
      );
    let next = { ...work };
    let revision = ingredient.version;
    if (payload.action === 'view') {
      next.viewedSessionId = payload.sessionId;
      next.viewedRevision = revision;
    } else if (payload.action === 'edit') {
      if (work.reviewStatus === 'reviewing')
        throw new ConflictException('Stop the review before editing.');
      const material = this.material({
        ...work,
        ...(payload.body !== undefined ? { body: payload.body } : {}),
        ...(payload.rows !== undefined ? { rows: payload.rows } : {}),
      });
      next = { ...material, threadId: scope.threadId, reviewStatus: 'pending' };
      revision++;
    } else if (payload.action === 'review') {
      if (
        work.viewedSessionId !== payload.sessionId ||
        work.viewedRevision !== revision
      )
        throw new BadRequestException('View this version before reviewing it.');
      if (work.reviewStatus === 'reviewing')
        throw new ConflictException('Review is already running.');
      next.reviewStatus = 'reviewing';
      next.reviewToken = randomUUID();
      delete next.reviewError;
    } else if (payload.action === 'skip' || payload.action === 'cancel') {
      next.reviewStatus = payload.action === 'skip' ? 'skipped' : 'pending';
      delete next.reviewToken;
      delete next.reviewError;
    } else throw new BadRequestException('Unsupported work action.');
    const result = await this.prisma.ingredient.updateMany({
      where: {
        id,
        version: payload.revision,
        updatedAt: ingredient.updatedAt,
        ...this.where(scope),
      },
      data: {
        version: revision,
        generationPrompt: next.body ?? JSON.stringify(next.rows),
        providerData: toPrismaJson({
          ...record(ingredient.providerData),
          agentWorkObject: next,
        }),
      },
    });
    if (result.count !== 1)
      throw new ConflictException(
        'This work changed. Reload it before continuing.',
      );
    if (
      (payload.action === 'cancel' || payload.action === 'skip') &&
      work.reviewExecutionId
    ) {
      await this.cancelReviewExecution(scope, work.reviewExecutionId);
    }
    return payload.action === 'review' ? next.reviewToken : undefined;
  }

  private async cancelReviewExecution(
    scope: AgentWorkObjectScope,
    executionId: string,
  ) {
    const execution = await this.prisma.workflowExecution.findFirst({
      where: {
        id: executionId,
        organizationId: scope.organizationId,
        userId: scope.userId,
        isDeleted: false,
      },
    });
    if (execution) await this.executions.cancelExecution(execution.id);
  }

  async linkReviewExecution(
    scope: AgentWorkObjectScope,
    id: string,
    token: string,
    executionId: string,
  ) {
    const { ingredient, work } = await this.load(scope, id);
    // A fast review may finish before the enqueue acknowledgement is linked.
    if (work.reviewStatus === 'passed' || work.reviewStatus === 'failed')
      return;
    if (work.reviewToken !== token || work.reviewStatus !== 'reviewing') {
      await this.cancelReviewExecution(scope, executionId);
      return;
    }
    const result = await this.prisma.ingredient.updateMany({
      where: {
        id,
        version: ingredient.version,
        updatedAt: ingredient.updatedAt,
        ...this.where(scope),
      },
      data: {
        providerData: toPrismaJson({
          ...record(ingredient.providerData),
          agentWorkObject: { ...work, reviewExecutionId: executionId },
        }),
      },
    });
    if (result.count !== 1)
      await this.cancelReviewExecution(scope, executionId);
  }

  async review(
    scope: AgentWorkObjectScope,
    id: string,
    token: string,
    runId?: string,
  ) {
    const { ingredient, work } = await this.load(scope, id);
    if (work.reviewStatus !== 'reviewing' || work.reviewToken !== token) return;
    await this.publisher.publishWorkEvent({
      event: 'tool_started',
      label: 'Reviewing your draft',
      status: 'running',
      runId: runId ?? work.reviewExecutionId,
      threadId: scope.threadId,
      userId: scope.userId,
    });
    const next = { ...work };
    try {
      const result = await this.scorer.scoreText(
        work.body ?? JSON.stringify(work.rows),
        work.kind,
      );
      next.reviewStatus = result.score >= 6 ? 'passed' : 'failed';
      if (next.reviewStatus === 'failed')
        next.reviewError =
          result.suggestions[0] ??
          'Revise the draft, retry review, or explicitly skip.';
    } catch {
      next.reviewStatus = 'failed';
      next.reviewError =
        'The review could not finish. Edit, retry, or explicitly skip.';
    }
    const current = await this.load(scope, id);
    if (
      current.work.reviewToken !== token ||
      current.work.reviewStatus !== 'reviewing'
    )
      return;
    delete next.reviewToken;
    await this.prisma.ingredient.updateMany({
      where: {
        id,
        version: ingredient.version,
        updatedAt: current.ingredient.updatedAt,
        ...this.where(scope),
      },
      data: {
        providerData: toPrismaJson({
          ...record(current.ingredient.providerData),
          agentWorkObject: next,
        }),
      },
    });
    await this.publisher.publishWorkEvent({
      event: 'tool_completed',
      label:
        next.reviewStatus === 'passed'
          ? 'Draft review passed'
          : 'Draft needs attention',
      status: next.reviewStatus === 'passed' ? 'completed' : 'failed',
      runId: runId ?? work.reviewExecutionId,
      threadId: scope.threadId,
      userId: scope.userId,
    });
  }

  async assertReady(
    context: ToolExecutionContext,
    toolName = 'generate_image',
  ) {
    if (
      !toolName.startsWith('generate_') &&
      toolName !== 'execute_workflow' &&
      toolName !== 'replicate_top_ingredient'
    )
      return;
    if (!context.threadId) return;
    const scope = this.scope(context);
    const snapshot = await this.prisma.agentThreadSnapshot.findFirst({
      where: {
        organizationId: scope.organizationId,
        threadId: scope.threadId,
        isDeleted: false,
      },
    });
    const pending = record(snapshot?.data).pendingInputRequests;
    if (Array.isArray(pending) && pending.length)
      throw new BadRequestException(
        'Answer the current choice before generating.',
      );
    const collection = await this.list(scope, '');
    if (
      collection.workObjects.some(
        (work) =>
          work.reviewStatus !== 'passed' && work.reviewStatus !== 'skipped',
      )
    )
      throw new BadRequestException(
        'Review your draft or explicitly skip review before generating.',
      );
  }

  scope(context: ToolExecutionContext): AgentWorkObjectScope {
    return {
      threadId: requiredString(context.threadId, 'threadId'),
      organizationId: context.organizationId,
      userId: context.userId,
      brandId: context.validatedScope?.brandId ?? context.brandId,
    };
  }
}
