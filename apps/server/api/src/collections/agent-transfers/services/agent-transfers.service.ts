import { createHash, randomUUID } from 'node:crypto';
import { CreateAgentTransferDto } from '@api/collections/agent-transfers/dto/create-agent-transfer.dto';
import {
  AgentMessageRole,
  AgentThreadStatus,
  AgentTransferDeliveryMode,
  AgentTransferStatus,
  WorkflowExecutionStatus,
} from '@genfeedai/enums';
import type { AgentArtifactReference } from '@genfeedai/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { AgentArtifactReferenceService, scopedWhere } from '@genfeedai/server';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { NotFoundException } from '@server/exceptions/not-found.exception';
import {
  AgentTurnAcceptanceService,
  buildAgentTurnIdempotencyKey,
} from '@server/services/agent-orchestrator/agent-turn-acceptance.service';
import type { AgentChatContext } from '@server/services/agent-orchestrator/interfaces/agent-chat.interface';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

/**
 * Projection of the agent-turn workflow result JSON that a transfer mirrors.
 *
 * `WorkflowExecution.result` is an untyped Json column, so the completion
 * fields are read defensively rather than cast.
 */
function readAgentTurnResult(value: unknown): {
  artifactReferences: unknown[];
  artifactVersionPinIds: string[];
  summary: string | null;
} {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    artifactReferences: Array.isArray(record.artifactReferences)
      ? record.artifactReferences
      : [],
    artifactVersionPinIds: Array.isArray(record.artifactVersionPinIds)
      ? record.artifactVersionPinIds.filter(
          (id): id is string => typeof id === 'string',
        )
      : [],
    summary:
      typeof record.summary === 'string' ? record.summary.slice(0, 500) : null,
  };
}

const MAX_TRANSFER_DEPTH = 3;
const MAX_SELECTED_CONTEXT_BYTES = 16_000;

type TransferActor = {
  organizationId: string;
  userId: string;
};

type AuthorizedThread = {
  brandId: string | null;
  contextVersion: number;
  id: string;
  title: string | null;
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function requestHash(input: CreateAgentTransferDto): string {
  const {
    explicitUserIntent: _intent,
    sourceActionId: _action,
    ...payload
  } = input;
  return `sha256:v1:${createHash('sha256')
    .update(stableStringify(payload))
    .digest('hex')}`;
}

@Injectable()
export class AgentTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly artifactReferenceService: AgentArtifactReferenceService,
    private readonly turnAcceptanceService: AgentTurnAcceptanceService,
  ) {}

  async discoverConversations(
    actor: TransferActor,
    sourceThreadId: string,
    query?: string,
    limit = 20,
  ) {
    await this.loadAuthorizedThread(actor, sourceThreadId);
    return this.prisma.agentThread.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        brandId: true,
        createdAt: true,
        id: true,
        title: true,
        updatedAt: true,
      },
      take: Math.min(Math.max(limit, 1), 50),
      where: scopedWhere(actor.organizationId, {
        id: { not: sourceThreadId },
        status: AgentThreadStatus.ACTIVE,
        userId: actor.userId,
        ...(query?.trim()
          ? {
              title: {
                contains: query.trim(),
                mode: 'insensitive' as const,
              },
            }
          : {}),
      }),
    });
  }

  async listForThread(actor: TransferActor, threadId: string) {
    await this.loadAuthorizedThread(actor, threadId, false);
    return this.prisma.agentTransfer.findMany({
      include: {
        destinationThread: { select: { title: true } },
        sourceThread: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
      where: scopedWhere(actor.organizationId, {
        OR: [{ sourceThreadId: threadId }, { destinationThreadId: threadId }],
        userId: actor.userId,
      }),
    });
  }

  async findOne(actor: TransferActor, id: string) {
    const transfer = await this.prisma.agentTransfer.findFirst({
      include: {
        destinationThread: { select: { title: true } },
        sourceThread: { select: { title: true } },
      },
      where: scopedWhere(actor.organizationId, {
        id,
        userId: actor.userId,
      }),
    });
    if (!transfer) {
      throw new NotFoundException('Agent transfer not found');
    }
    return transfer;
  }

  async create(input: CreateAgentTransferDto, actor: TransferActor) {
    input.content = input.content.trim();
    input.idempotencyKey = input.idempotencyKey.trim();
    input.destinationTitle = input.destinationTitle?.trim();
    if (!input.content) {
      throw new BadRequestException('Transfer content is required.');
    }
    if (!input.idempotencyKey) {
      throw new BadRequestException('Transfer idempotencyKey is required.');
    }
    if (input.destinationThreadId === input.sourceThreadId) {
      throw new BadRequestException(
        'Source and destination conversations must be different.',
      );
    }
    const hash = requestHash(input);
    const existing = await this.prisma.agentTransfer.findFirst({
      where: scopedWhere(actor.organizationId, {
        idempotencyKey: input.idempotencyKey,
        userId: actor.userId,
      }),
    });
    if (existing) {
      if (existing.requestHash !== hash) {
        throw new ConflictException(
          'idempotencyKey was already used for another transfer.',
        );
      }
      if (
        input.deliveryMode === AgentTransferDeliveryMode.SEND_AND_RUN &&
        input.explicitUserIntent === true &&
        [AgentTransferStatus.PENDING, AgentTransferStatus.FAILED].includes(
          existing.status as AgentTransferStatus,
        )
      ) {
        const destination = await this.loadAuthorizedThread(
          actor,
          existing.destinationThreadId,
        );
        await this.startDestinationRun(existing.id, destination, input, actor);
      }
      return this.findOne(actor, existing.id);
    }

    const source = await this.loadAuthorizedThread(actor, input.sourceThreadId);
    const destination = input.destinationThreadId
      ? await this.loadAuthorizedThread(actor, input.destinationThreadId)
      : await this.createDestinationThread(actor, input, source);
    this.assertCompatibleScope(source, destination);
    this.assertSelectedContextBounded(input.selectedContext);
    await this.reauthorizeArtifacts(input, actor, source, destination);

    const parent = await this.resolveParentTransfer(actor, input);
    const depth = (parent?.depth ?? -1) + 1;
    const transferId = randomUUID();
    const correlationId = randomUUID();
    const sourceMessageId = input.sourceActionId ? null : randomUUID();
    const destinationMessageId =
      input.deliveryMode === AgentTransferDeliveryMode.SEND
        ? randomUUID()
        : null;
    const depthExceeded = depth > MAX_TRANSFER_DEPTH;
    if (depthExceeded && !input.destinationThreadId) {
      throw new BadRequestException(
        'Transfer depth limit reached; a new destination was not created.',
      );
    }

    if (
      input.deliveryMode === AgentTransferDeliveryMode.SEND_AND_RUN &&
      input.explicitUserIntent !== true
    ) {
      throw new BadRequestException(
        'SEND_AND_RUN requires explicit user confirmation.',
      );
    }

    const transfer = await this.prisma
      .$transaction(async (tx) => {
        if (!input.destinationThreadId) {
          await tx.agentThread.create({
            data: {
              brandId: destination.brandId,
              contextVersion: destination.contextVersion,
              id: destination.id,
              organizationId: actor.organizationId,
              source: 'agent-transfer',
              status: AgentThreadStatus.ACTIVE,
              title: destination.title,
              userId: actor.userId,
            },
          });
        }
        const created = await tx.agentTransfer.create({
          data: {
            artifactReferences: (input.artifactReferences ??
              []) as unknown as Prisma.InputJsonValue,
            artifactVersionPinIds: input.artifactVersionPinIds ?? [],
            content: input.content.trim(),
            correlationId,
            deliveryMode: input.deliveryMode,
            depth: Math.min(depth, MAX_TRANSFER_DEPTH),
            destinationBrandId: destination.brandId,
            destinationMessageId,
            destinationThreadId: destination.id,
            id: transferId,
            idempotencyKey: input.idempotencyKey,
            organizationId: actor.organizationId,
            parentCorrelationId: parent?.correlationId ?? null,
            requestHash: hash,
            selectedContext: (input.selectedContext ??
              {}) as Prisma.InputJsonValue,
            sourceBrandId: source.brandId,
            sourceMessageId,
            sourceThreadId: source.id,
            status: depthExceeded
              ? AgentTransferStatus.DEPTH_LIMIT_REACHED
              : input.deliveryMode === AgentTransferDeliveryMode.SEND
                ? AgentTransferStatus.DELIVERED
                : AgentTransferStatus.PENDING,
            ...(destinationMessageId ? { deliveredAt: new Date() } : {}),
            userId: actor.userId,
          },
        });

        if (sourceMessageId) {
          await tx.agentMessage.create({
            data: {
              brandId: source.brandId,
              content: input.content.trim(),
              id: sourceMessageId,
              isDeleted: false,
              metadata: {
                agentTransfer: { direction: 'outbound', transferId },
              },
              organizationId: actor.organizationId,
              role: AgentMessageRole.SYSTEM,
              threadId: source.id,
              userId: actor.userId,
            },
          });
        }

        if (destinationMessageId && !depthExceeded) {
          await tx.agentMessage.create({
            data: {
              artifactReferences: (input.artifactReferences ??
                []) as unknown as Prisma.InputJsonValue,
              artifactVersionPinIds: input.artifactVersionPinIds ?? [],
              brandId: destination.brandId,
              content: input.content.trim(),
              id: destinationMessageId,
              isDeleted: false,
              metadata: {
                agentTransfer: { direction: 'inbound', transferId },
              },
              organizationId: actor.organizationId,
              role: AgentMessageRole.USER,
              threadId: destination.id,
              userId: actor.userId,
            },
          });
        }
        return created;
      })
      .catch(async (error: unknown) => {
        if ((error as { code?: unknown }).code !== 'P2002') {
          throw error;
        }
        const winner = await this.prisma.agentTransfer.findFirst({
          where: scopedWhere(actor.organizationId, {
            idempotencyKey: input.idempotencyKey,
            userId: actor.userId,
          }),
        });
        if (!winner || winner.requestHash !== hash) {
          throw error;
        }
        return winner;
      });

    if (
      !depthExceeded &&
      input.deliveryMode === AgentTransferDeliveryMode.SEND_AND_RUN
    ) {
      await this.startDestinationRun(transfer.id, destination, input, actor);
    }

    return this.findOne(actor, transfer.id);
  }

  async retry(id: string, actor: TransferActor) {
    const transfer = await this.findOne(actor, id);
    if (
      transfer.deliveryMode !== AgentTransferDeliveryMode.SEND_AND_RUN ||
      transfer.status !== AgentTransferStatus.FAILED
    ) {
      throw new ConflictException(
        'Only failed send-and-run transfers can retry.',
      );
    }
    const destination = await this.loadAuthorizedThread(
      actor,
      transfer.destinationThreadId,
    );
    await this.prisma.agentTransfer.updateMany({
      data: { lastAttemptAt: new Date(), retryCount: { increment: 1 } },
      where: scopedWhere(actor.organizationId, {
        id,
        status: AgentTransferStatus.FAILED,
        userId: actor.userId,
      }),
    });
    await this.startDestinationRun(
      id,
      destination,
      {
        artifactReferences:
          transfer.artifactReferences as unknown as AgentArtifactReference[],
        artifactVersionPinIds: transfer.artifactVersionPinIds,
        content: transfer.content,
        deliveryMode: AgentTransferDeliveryMode.SEND_AND_RUN,
        explicitUserIntent: true,
        idempotencyKey: transfer.idempotencyKey,
        sourceThreadId: transfer.sourceThreadId,
      },
      actor,
    );
    return this.findOne(actor, id);
  }

  private async startDestinationRun(
    transferId: string,
    destination: AuthorizedThread,
    input: CreateAgentTransferDto,
    actor: TransferActor,
  ) {
    try {
      const acknowledgement = await this.turnAcceptanceService.accept(
        {
          artifactReferences: input.artifactReferences,
          brandId: destination.brandId,
          clientRequestId: `agent-transfer:${transferId}`,
          content: input.content.trim(),
          expectedContextVersion: destination.contextVersion,
          source: 'agent',
          threadId: destination.id,
          transferId,
        },
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
        } satisfies AgentChatContext,
      );
      await this.prisma.agentTransfer.updateMany({
        data: {
          destinationExecutionId: acknowledgement.executionId,
          lastAttemptAt: new Date(),
          queuedAt: new Date(acknowledgement.queuedAt),
          status: AgentTransferStatus.QUEUED,
        },
        where: scopedWhere(actor.organizationId, {
          id: transferId,
          userId: actor.userId,
        }),
      });
      const execution = await this.prisma.workflowExecution.findFirst({
        where: scopedWhere(actor.organizationId, {
          id: acknowledgement.executionId,
          userId: actor.userId,
        }),
      });
      if (execution && execution.status !== WorkflowExecutionStatus.PENDING) {
        const status = execution.status as WorkflowExecutionStatus;
        const turnResult = readAgentTurnResult(execution.result);
        await this.prisma.agentTransfer.updateMany({
          data: {
            completedAt: execution.completedAt,
            completionSummary: turnResult.summary,
            failureReason: execution.error?.slice(0, 500),
            outputArtifactReferences:
              turnResult.artifactReferences as Prisma.InputJsonValue,
            outputArtifactVersionPinIds: turnResult.artifactVersionPinIds,
            progress: execution.progress,
            startedAt: execution.startedAt,
            status:
              status === WorkflowExecutionStatus.RUNNING
                ? AgentTransferStatus.RUNNING
                : status === WorkflowExecutionStatus.COMPLETED
                  ? AgentTransferStatus.COMPLETED
                  : status === WorkflowExecutionStatus.CANCELLED
                    ? AgentTransferStatus.CANCELLED
                    : AgentTransferStatus.FAILED,
          },
          where: scopedWhere(actor.organizationId, {
            destinationExecutionId: acknowledgement.executionId,
            id: transferId,
            userId: actor.userId,
          }),
        });
      }
    } catch (error: unknown) {
      const failedExecution = await this.prisma.workflowExecution.findFirst({
        select: { id: true },
        where: scopedWhere(actor.organizationId, {
          idempotencyKey: buildAgentTurnIdempotencyKey(
            actor.organizationId,
            actor.userId,
            `agent-transfer:${transferId}`,
          ),
          userId: actor.userId,
        }),
      });
      await this.prisma.agentTransfer.updateMany({
        data: {
          ...(failedExecution
            ? { destinationExecutionId: failedExecution.id }
            : {}),
          failureReason:
            error instanceof Error
              ? error.message.slice(0, 500)
              : 'Destination run could not be queued.',
          lastAttemptAt: new Date(),
          status: AgentTransferStatus.FAILED,
        },
        where: scopedWhere(actor.organizationId, {
          id: transferId,
          userId: actor.userId,
        }),
      });
    }
  }

  private async loadAuthorizedThread(
    actor: TransferActor,
    threadId: string,
    requireActive = true,
  ): Promise<AuthorizedThread> {
    const thread = await this.prisma.agentThread.findFirst({
      select: {
        brandId: true,
        contextVersion: true,
        id: true,
        status: true,
        title: true,
      },
      where: scopedWhere(actor.organizationId, {
        id: threadId,
        userId: actor.userId,
      }),
    });
    if (
      !thread ||
      (requireActive && thread.status !== AgentThreadStatus.ACTIVE)
    ) {
      throw new NotFoundException('Agent conversation not found');
    }
    return thread;
  }

  private async createDestinationThread(
    actor: TransferActor,
    input: CreateAgentTransferDto,
    source: AuthorizedThread,
  ): Promise<AuthorizedThread> {
    const brandId = input.destinationBrandId ?? source.brandId;
    if (brandId) {
      const brand = await this.prisma.brand.findFirst({
        select: { id: true },
        where: scopedWhere(actor.organizationId, { id: brandId }),
      });
      if (!brand) {
        throw new NotFoundException('Destination brand not found');
      }
    }
    return {
      brandId,
      contextVersion: 1,
      id: randomUUID(),
      title: input.destinationTitle?.trim() || 'Specialist handoff',
    };
  }

  private assertCompatibleScope(
    source: AuthorizedThread,
    destination: AuthorizedThread,
  ) {
    if (source.brandId && source.brandId !== destination.brandId) {
      throw new BadRequestException(
        'Transfers cannot widen or cross the source conversation brand scope.',
      );
    }
  }

  private assertSelectedContextBounded(context?: Record<string, unknown>) {
    if (
      context &&
      Buffer.byteLength(JSON.stringify(context), 'utf8') >
        MAX_SELECTED_CONTEXT_BYTES
    ) {
      throw new BadRequestException('Selected transfer context is too large.');
    }
  }

  private async reauthorizeArtifacts(
    input: CreateAgentTransferDto,
    actor: TransferActor,
    source: AuthorizedThread,
    destination: AuthorizedThread,
  ) {
    for (const reference of input.artifactReferences ?? []) {
      await this.artifactReferenceService.resolveReference(reference, {
        ...(source.brandId ? { brandId: source.brandId } : {}),
        organizationId: actor.organizationId,
      });
      await this.artifactReferenceService.resolveReference(reference, {
        ...(destination.brandId ? { brandId: destination.brandId } : {}),
        organizationId: actor.organizationId,
      });
    }
    for (const pinId of input.artifactVersionPinIds ?? []) {
      await this.artifactReferenceService.resolveVersionPin({
        pinId,
        readContext: {
          ...(destination.brandId ? { brandId: destination.brandId } : {}),
          organizationId: actor.organizationId,
        },
      });
    }
  }

  private async resolveParentTransfer(
    actor: TransferActor,
    input: CreateAgentTransferDto,
  ) {
    if (input.parentCorrelationId) {
      const parent = await this.prisma.agentTransfer.findFirst({
        where: scopedWhere(actor.organizationId, {
          correlationId: input.parentCorrelationId,
          destinationThreadId: input.sourceThreadId,
          userId: actor.userId,
        }),
      });
      if (!parent) {
        throw new NotFoundException('Parent transfer not found');
      }
      return parent;
    }
    return this.prisma.agentTransfer.findFirst({
      orderBy: { createdAt: 'desc' },
      where: scopedWhere(actor.organizationId, {
        destinationThreadId: input.sourceThreadId,
        userId: actor.userId,
      }),
    });
  }
}
