import { randomUUID } from 'node:crypto';
import { AgentThreadAccessService } from '@api/collections/agent-threads/services/agent-thread-access.service';
import { CreateAgentTransferDto } from '@api/collections/agent-transfers/dto/create-agent-transfer.dto';
import {
  buildTransferResultContent,
  settleAgentTransferFromExecution,
} from '@api/collections/agent-transfers/services/agent-transfer-settlement.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { AgentArtifactReferenceService, scopedWhere } from '@api/index';
import {
  AgentTurnAcceptanceService,
  buildAgentTurnIdempotencyKey,
} from '@api/services/agent-orchestrator/agent-turn-acceptance.service';
import type { AgentChatContext } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { AgentInitiatingPrincipal } from '@api/services/agent-orchestrator/utils/agent-initiating-principal.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentMessageRole,
  AgentThreadStatus,
  AgentTransferDeliveryMode,
  AgentTransferStatus,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import type { AgentArtifactReference } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { Traced } from '@libs/tracing/traced';
import { sha256Hex, stableStringify } from '@libs/utils/canonical-hash.util';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

const MAX_TRANSFER_DEPTH = 3;
const MAX_SELECTED_CONTEXT_BYTES = 16_000;

type TransferActor = {
  /**
   * The authenticated principal of the user or API key accepting the transfer
   * into a run (the create-and-run and retry endpoints). The queued destination
   * turn binds the schedules it saves to them. Absent for read-only callers.
   */
  initiatingPrincipal?: AgentInitiatingPrincipal;
  organizationId: string;
  userId: string;
};

type AuthorizedThread = {
  brandId: string | null;
  contextVersion: number;
  id: string;
  title: string | null;
};

function requestHash(input: CreateAgentTransferDto): string {
  const {
    explicitUserIntent: _intent,
    sourceActionId: _action,
    ...payload
  } = input;
  return `sha256:v1:${sha256Hex(stableStringify(payload))}`;
}

function assertSendAndRunConfirmed(input: CreateAgentTransferDto): void {
  if (
    input.deliveryMode === AgentTransferDeliveryMode.SEND_AND_RUN &&
    input.explicitUserIntent !== true
  ) {
    throw new BadRequestException(
      'SEND_AND_RUN requires explicit user confirmation.',
    );
  }
}

@Traced()
@Injectable()
export class AgentTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly artifactReferenceService: AgentArtifactReferenceService,
    private readonly turnAcceptanceService: AgentTurnAcceptanceService,
    private readonly threadAccess: AgentThreadAccessService,
  ) {}

  async discoverConversations(
    actor: TransferActor,
    sourceThreadId: string,
    query?: string,
    limit = 20,
  ) {
    await this.loadAuthorizedThread(actor, sourceThreadId);
    const threads = await this.prisma.agentThread.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        brandId: true,
        createdAt: true,
        id: true,
        // The latest hand-off this thread sent there, so the caller can see
        // where the work stands and what it produced before it hands on more.
        inboundTransfers: {
          orderBy: { createdAt: 'desc' },
          select: {
            completedAt: true,
            completionSummary: true,
            failureReason: true,
            outputArtifactReferences: true,
            status: true,
          },
          take: 1,
          where: scopedWhere(actor.organizationId, {
            sourceThreadId,
            userId: actor.userId,
          }),
        },
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
    return threads.map(({ inboundTransfers, ...thread }) => ({
      ...thread,
      latestHandoff: inboundTransfers[0] ?? null,
    }));
  }

  /**
   * The teammates a hand-off from this conversation can reach (#9940): active
   * members of the organization other than the caller, who also have access to
   * the conversation's brand. A conversation with no brand reaches every active
   * member.
   */
  async discoverTeammates(
    actor: TransferActor,
    sourceThreadId: string,
    limit = 50,
  ): Promise<Array<{ name: string; userId: string }>> {
    const source = await this.loadAuthorizedThread(actor, sourceThreadId);
    const members = await this.prisma.member.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        user: { select: { firstName: true, handle: true, lastName: true } },
        userId: true,
      },
      take: Math.min(Math.max(limit, 1), 50),
      where: scopedWhere(actor.organizationId, {
        isActive: true,
        userId: { not: actor.userId },
      }),
    });
    const reachable: Array<{ name: string; userId: string }> = [];
    for (const member of members) {
      if (
        await this.canReachBrand(
          actor.organizationId,
          member.userId,
          source.brandId,
        )
      ) {
        const name = [member.user.firstName, member.user.lastName]
          .filter(Boolean)
          .join(' ')
          .trim();
        reachable.push({
          name: name || member.user.handle,
          userId: member.userId,
        });
      }
    }
    return reachable;
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
        AND: [
          {
            OR: [
              { sourceThreadId: threadId },
              { destinationThreadId: threadId },
            ],
          },
          this.partyWhere(actor),
        ],
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
        AND: [this.partyWhere(actor)],
        id,
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
    const destinationUserId = this.resolveHandoffUserId(input, actor);
    const hash = requestHash(input);
    const existing = await this.prisma.agentTransfer.findFirst({
      where: scopedWhere(actor.organizationId, {
        idempotencyKey: input.idempotencyKey,
        userId: actor.userId,
      }),
    });
    if (existing) {
      return this.replayTransfer(existing, hash, input, actor);
    }

    const source = await this.loadAuthorizedThread(actor, input.sourceThreadId);
    const destination = input.destinationThreadId
      ? await this.loadAuthorizedThread(actor, input.destinationThreadId)
      : await this.createDestinationThread(actor, input, source);
    if (destinationUserId) {
      await this.assertTeammateReach(
        actor.organizationId,
        destinationUserId,
        destination.brandId,
      );
    }
    this.assertCompatibleScope(source, destination, input);
    this.assertSelectedContextBounded(input.selectedContext);
    await this.reauthorizeArtifacts(input, actor, source, destination);

    const parent = await this.resolveParentTransfer(actor, input);
    const depth = (parent?.depth ?? -1) + 1;
    const transferId = randomUUID();
    const correlationId = randomUUID();
    const sourceMessageId = input.sourceActionId ? null : randomUUID();
    // A hand-off leaves a marker in the teammate's conversation at once, so the
    // request is there to accept or decline. A SEND leaves its message too.
    const destinationMessageId =
      input.deliveryMode === AgentTransferDeliveryMode.SEND || destinationUserId
        ? randomUUID()
        : null;
    const depthExceeded = depth > MAX_TRANSFER_DEPTH;
    if (depthExceeded && !input.destinationThreadId) {
      throw new BadRequestException(
        'Transfer depth limit reached; a new destination was not created.',
      );
    }

    assertSendAndRunConfirmed(input);

    const transfer = await this.prisma
      .$transaction(async (tx) => {
        if (!input.destinationThreadId) {
          await tx.agentThread.create({
            data: {
              brandId: destination.brandId,
              contextVersion: destination.contextVersion,
              id: destination.id,
              organizationId: actor.organizationId,
              // The orchestrating thread owns what it spawns (#8526). A hand-off
              // belongs to the teammate, who cannot open the sender's thread, so
              // it has no parent.
              parentThreadId: destinationUserId ? null : source.id,
              source: 'agent-transfer',
              status: AgentThreadStatus.ACTIVE,
              title: destination.title,
              userId: destinationUserId ?? actor.userId,
            },
          });
        }
        const created = await tx.agentTransfer.create({
          data: {
            artifactReferences: input.artifactReferences ?? [],
            artifactVersionPinIds: input.artifactVersionPinIds ?? [],
            content: input.content.trim(),
            correlationId,
            deliveryMode: input.deliveryMode,
            depth: Math.min(depth, MAX_TRANSFER_DEPTH),
            destinationBrandId: destination.brandId,
            destinationMessageId,
            destinationThreadId: destination.id,
            ...(destinationUserId ? { destinationUserId } : {}),
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
              : destinationUserId
                ? AgentTransferStatus.AWAITING_ACCEPTANCE
                : input.deliveryMode === AgentTransferDeliveryMode.SEND
                  ? AgentTransferStatus.DELIVERED
                  : AgentTransferStatus.PENDING,
            ...(destinationMessageId && !destinationUserId
              ? { deliveredAt: new Date() }
              : {}),
            userId: actor.userId,
          },
        });

        await this.createTransferMessages(tx, {
          depthExceeded,
          destination,
          destinationMessageId,
          destinationUserId,
          input,
          source,
          sourceMessageId,
          transferId,
          userId: actor.userId,
          organizationId: actor.organizationId,
        });
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
      !destinationUserId &&
      input.deliveryMode === AgentTransferDeliveryMode.SEND_AND_RUN
    ) {
      await this.startDestinationRun(transfer.id, destination, input, actor);
    }

    return this.findOne(actor, transfer.id);
  }

  async retry(id: string, actor: TransferActor) {
    const transfer = await this.findOne(actor, id);
    // A hand-off runs as the teammate: only they can start it again.
    if (
      transfer.destinationUserId &&
      transfer.destinationUserId !== actor.userId
    ) {
      throw new ForbiddenException(
        'Only the teammate this was handed to can retry it.',
      );
    }
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

  /**
   * The teammate says yes to a hand-off (#9940). The request moves to PENDING
   * once, then the destination turn is queued as the accepting member: the run
   * carries their authority, brand access and credits, never the sender's.
   */
  async accept(id: string, actor: TransferActor) {
    const transfer = await this.findAwaitingHandoff(actor, id);
    const destination = await this.loadAuthorizedThread(
      actor,
      transfer.destinationThreadId,
    );
    const claimed = await this.prisma.agentTransfer.updateMany({
      data: { lastAttemptAt: new Date(), status: AgentTransferStatus.PENDING },
      where: scopedWhere(actor.organizationId, {
        destinationUserId: actor.userId,
        id,
        status: AgentTransferStatus.AWAITING_ACCEPTANCE,
      }),
    });
    if (claimed.count !== 1) {
      throw new ConflictException('This hand-off was already answered.');
    }
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

  /**
   * The teammate says no. Nothing runs; the sender's conversation is told, and
   * the conversation made for the request is archived so it does not linger in
   * the teammate's list.
   */
  async decline(id: string, actor: TransferActor) {
    const transfer = await this.findAwaitingHandoff(actor, id);
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.agentTransfer.updateMany({
        data: {
          completedAt: new Date(),
          status: AgentTransferStatus.DECLINED,
        },
        where: scopedWhere(actor.organizationId, {
          destinationUserId: actor.userId,
          id,
          status: AgentTransferStatus.AWAITING_ACCEPTANCE,
        }),
      });
      if (moved.count !== 1) {
        throw new ConflictException('This hand-off was already answered.');
      }
      await tx.agentThread.updateMany({
        data: { status: AgentThreadStatus.ARCHIVED },
        where: scopedWhere(actor.organizationId, {
          id: transfer.destinationThreadId,
          userId: actor.userId,
        }),
      });
      await tx.agentMessage.create({
        data: {
          brandId: transfer.sourceBrandId,
          content: buildTransferResultContent({
            failureReason: null,
            status: AgentTransferStatus.DECLINED,
            summary: null,
            title: transfer.destinationThread.title,
          }),
          id: randomUUID(),
          isDeleted: false,
          metadata: {
            agentTransferResult: {
              destinationThreadId: transfer.destinationThreadId,
              outputArtifactReferences: [],
              status: AgentTransferStatus.DECLINED,
              transferId: id,
            },
          },
          organizationId: actor.organizationId,
          role: AgentMessageRole.SYSTEM,
          threadId: transfer.sourceThreadId,
          userId: transfer.userId,
        },
      });
    });
    return this.findOne(actor, id);
  }

  /**
   * The teammate a hand-off goes to (#9940), or undefined for a plain transfer
   * between the sender's own conversations. A hand-off creates its own
   * conversation for the teammate and runs their agent, so it takes no existing
   * destination and must be SEND_AND_RUN.
   */
  private resolveHandoffUserId(
    input: CreateAgentTransferDto,
    actor: TransferActor,
  ): string | undefined {
    if (!input.destinationUserId || input.destinationUserId === actor.userId) {
      return undefined;
    }
    if (input.destinationThreadId) {
      throw new BadRequestException(
        'A hand-off creates its own conversation for the teammate; it cannot target an existing one.',
      );
    }
    if (input.deliveryMode !== AgentTransferDeliveryMode.SEND_AND_RUN) {
      throw new BadRequestException(
        'A hand-off to a teammate runs their agent, so it must be SEND_AND_RUN.',
      );
    }
    return input.destinationUserId;
  }

  /** Answers a repeat of a request that already created a transfer. */
  private async replayTransfer(
    existing: {
      destinationThreadId: string;
      destinationUserId: string | null;
      id: string;
      requestHash: string;
      status: string;
    },
    hash: string,
    input: CreateAgentTransferDto,
    actor: TransferActor,
  ) {
    if (existing.requestHash !== hash) {
      throw new ConflictException(
        'idempotencyKey was already used for another transfer.',
      );
    }
    // A hand-off's run is started by the teammate who accepts it, never by a
    // repeat of the sender's request.
    if (
      !existing.destinationUserId &&
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

  /**
   * The notes a transfer leaves in the two conversations: the sender's record,
   * and the request in the destination (a message from the sender, or for a
   * hand-off a note in the teammate's conversation, not one they wrote).
   */
  private async createTransferMessages(
    tx: Prisma.TransactionClient,
    params: {
      depthExceeded: boolean;
      destination: AuthorizedThread;
      destinationMessageId: string | null;
      destinationUserId?: string;
      input: CreateAgentTransferDto;
      organizationId: string;
      source: AuthorizedThread;
      sourceMessageId: string | null;
      transferId: string;
      userId: string;
    },
  ) {
    const { destination, destinationUserId, input, source, transferId } =
      params;
    if (params.sourceMessageId) {
      await tx.agentMessage.create({
        data: {
          brandId: source.brandId,
          content: input.content.trim(),
          id: params.sourceMessageId,
          isDeleted: false,
          metadata: { agentTransfer: { direction: 'outbound', transferId } },
          organizationId: params.organizationId,
          role: AgentMessageRole.SYSTEM,
          threadId: source.id,
          userId: params.userId,
        },
      });
    }
    if (params.destinationMessageId && !params.depthExceeded) {
      await tx.agentMessage.create({
        data: {
          artifactReferences: input.artifactReferences ?? [],
          artifactVersionPinIds: input.artifactVersionPinIds ?? [],
          brandId: destination.brandId,
          content: input.content.trim(),
          id: params.destinationMessageId,
          isDeleted: false,
          metadata: { agentTransfer: { direction: 'inbound', transferId } },
          organizationId: params.organizationId,
          role: destinationUserId
            ? AgentMessageRole.SYSTEM
            : AgentMessageRole.USER,
          threadId: destination.id,
          userId: destinationUserId ?? params.userId,
        },
      });
    }
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
          ...(actor.initiatingPrincipal
            ? { initiatingPrincipal: actor.initiatingPrincipal }
            : {}),
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
        where: scopedWhere(actor.organizationId, { id: transferId }),
      });
      const execution = await this.prisma.workflowExecution.findFirst({
        where: scopedWhere(actor.organizationId, {
          id: acknowledgement.executionId,
          userId: actor.userId,
        }),
      });
      if (execution && execution.status !== WorkflowExecutionStatus.PENDING) {
        // The child may already have ended; its terminal event fired before
        // the transfer knew the execution id, so settle it here (#8527).
        await settleAgentTransferFromExecution(this.prisma, {
          execution,
          organizationId: actor.organizationId,
          transferId,
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
        where: scopedWhere(actor.organizationId, { id: transferId }),
      });
    }
  }

  /** The transfers a member is a party to: they sent it, or it lands in their thread. */
  private partyWhere(actor: TransferActor) {
    return {
      OR: [{ userId: actor.userId }, { destinationUserId: actor.userId }],
    };
  }

  /** The hand-off a teammate may still answer, or a refusal that names nothing else. */
  private async findAwaitingHandoff(actor: TransferActor, id: string) {
    const transfer = await this.prisma.agentTransfer.findFirst({
      include: { destinationThread: { select: { title: true } } },
      where: scopedWhere(actor.organizationId, {
        destinationUserId: actor.userId,
        id,
      }),
    });
    if (!transfer) {
      throw new NotFoundException('Agent transfer not found');
    }
    if (transfer.status !== AgentTransferStatus.AWAITING_ACCEPTANCE) {
      throw new ConflictException('This hand-off was already answered.');
    }
    return transfer;
  }

  /** Whether a live member of the organization reaches this brand (any brand, when none). */
  private async canReachBrand(
    organizationId: string,
    userId: string,
    brandId: string | null,
  ): Promise<boolean> {
    const scope = await this.threadAccess.resolveListScope({
      organizationId,
      userId,
    });
    if (!scope) {
      return false;
    }
    return (
      !brandId ||
      scope.brandIds === undefined ||
      scope.brandIds.includes(brandId)
    );
  }

  private async assertTeammateReach(
    organizationId: string,
    userId: string,
    brandId: string | null,
  ) {
    if (!(await this.canReachBrand(organizationId, userId, brandId))) {
      // The same answer for a stranger, a removed member and a member without
      // the brand: a denial never says which.
      throw new NotFoundException('Teammate not found');
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
    input: CreateAgentTransferDto,
  ) {
    // An existing destination keeps its own brand, so a different brand named
    // for it is a mistake to surface, not to ignore.
    if (
      input.destinationThreadId &&
      input.destinationBrandId &&
      input.destinationBrandId !== destination.brandId
    ) {
      throw new BadRequestException(
        'destinationBrandId does not match the destination conversation.',
      );
    }
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
