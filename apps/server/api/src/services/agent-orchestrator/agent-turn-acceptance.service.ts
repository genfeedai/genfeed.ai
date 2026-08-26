import { createHash } from 'node:crypto';
import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { AgentRunQueueService } from '@api/queues/agent-run/agent-run-queue.service';
import type {
  AgentChatContext,
  AgentChatRequest,
  AgentTurnAcknowledgement,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentExecutionTrigger,
  AgentRunStatus,
  AgentThreadStatus,
} from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import { AgentScopeContextService } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

const ARCHIVED_THREAD_WRITE_ERROR =
  'This thread is archived. Unarchive it before sending messages or running actions.';

function stableUuid(...parts: string[]): string {
  const hex = createHash('sha256').update(parts.join('\u001f')).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
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

function requestDigest(request: AgentChatRequest, threadId: string): string {
  const material = { ...request, threadId };
  return `sha256:v1:${createHash('sha256')
    .update(stableStringify(material))
    .digest('hex')}`;
}

@Injectable()
export class AgentTurnAcceptanceService {
  private readonly logContext = 'AgentTurnAcceptanceService';

  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly scopeService: AgentScopeContextService,
    private readonly queueService: AgentRunQueueService,
    private readonly credentialCryptoService: CredentialCryptoService,
  ) {}

  async accept(
    request: AgentChatRequest & { clientRequestId: string },
    context: AgentChatContext,
  ): Promise<AgentTurnAcknowledgement> {
    const acceptedAt = Date.now();
    const runId = stableUuid(
      'agent-turn-run',
      context.organizationId,
      context.userId,
      request.clientRequestId,
    );
    const stageStartedAt: Record<string, number> = {};
    const stageDurationMs: Record<string, number> = {};
    const measure = async <T>(stage: string, operation: () => Promise<T>) => {
      stageStartedAt[stage] = Date.now();
      try {
        const result = await operation();
        stageDurationMs[stage] = Date.now() - stageStartedAt[stage];
        this.logger.log(`${this.logContext} stage completed`, {
          clientRequestId: request.clientRequestId,
          durationMs: stageDurationMs[stage],
          organizationId: context.organizationId,
          runId,
          stage,
        });
        return result;
      } catch (error: unknown) {
        stageDurationMs[stage] = Date.now() - stageStartedAt[stage];
        this.logger.error(`${this.logContext} stage failed`, {
          clientRequestId: request.clientRequestId,
          durationMs: stageDurationMs[stage],
          error: error instanceof Error ? error.message : String(error),
          organizationId: context.organizationId,
          runId,
          stage,
        });
        throw error;
      }
    };

    const preparedScope = await measure('authorize_scope', () =>
      this.scopeService.prepareForTurn({
        expectedContextVersion: request.expectedContextVersion,
        organizationId: context.organizationId,
        requestedBrandId: request.brandId,
        threadId: request.threadId,
        userId: context.userId,
      }),
    );

    const threadId =
      preparedScope.existingScope?.threadId ??
      stableUuid(
        'agent-turn-thread',
        context.organizationId,
        context.userId,
        request.clientRequestId,
      );

    const thread = preparedScope.existingScope
      ? await measure('load_thread', async () => {
          const existing = await this.prisma.agentThread.findFirst({
            select: {
              brandId: true,
              contextVersion: true,
              id: true,
              status: true,
            },
            where: {
              id: threadId,
              isDeleted: false,
              organizationId: context.organizationId,
              userId: context.userId,
            },
          });
          if (
            [AgentThreadStatus.ARCHIVED, 'archived'].includes(
              String(existing?.status ?? '').toLowerCase(),
            )
          ) {
            throw new BadRequestException(ARCHIVED_THREAD_WRITE_ERROR);
          }
          return existing ?? preparedScope.existingScope;
        })
      : await measure('persist_thread', () => {
          const title = request.content.trim().slice(0, 120) || 'New thread';
          const createData = {
            ...preparedScope.initialScopeFields,
            id: threadId,
            organizationId: context.organizationId,
            planModeEnabled: request.planModeEnabled ?? false,
            source: request.source ?? 'agent',
            status: AgentThreadStatus.ACTIVE,
            title,
            userId: context.userId,
          } satisfies Prisma.AgentThreadUncheckedCreateInput;
          return this.prisma.agentThread.upsert({
            create: createData,
            update: {},
            where: {
              id: threadId,
              isDeleted: false,
              organizationId: context.organizationId,
            },
          });
        });

    const contextVersion = Number(thread.contextVersion ?? 1);
    const contextId = `${threadId}:v${contextVersion}`;
    const queuedAt = new Date().toISOString();
    const requestHash = requestDigest(request, threadId);
    const metadata = {
      clientRequestId: request.clientRequestId,
      contextId,
      requestState: 'queued',
      requestHash,
      source: request.source ?? 'agent',
      threadId,
    };

    const persistedRun = await measure('persist_run', () =>
      this.prisma.agentRun.upsert({
        create: {
          brandId: thread.brandId ?? undefined,
          id: runId,
          label: request.content.slice(0, 120),
          metadata: metadata as Prisma.InputJsonValue,
          objective: request.content,
          organizationId: context.organizationId,
          status: AgentRunStatus.PENDING,
          threadId,
          trigger: AgentExecutionTrigger.MANUAL,
          userId: context.userId,
        },
        update: {},
        where: {
          id: runId,
          isDeleted: false,
          organizationId: context.organizationId,
        },
      }),
    );
    const persistedMetadata = persistedRun.metadata as Record<string, unknown>;
    if (
      typeof persistedMetadata?.requestHash === 'string' &&
      persistedMetadata.requestHash !== requestHash
    ) {
      throw new ConflictException(
        'clientRequestId was already used for another turn.',
      );
    }

    const persistedStatus = String(persistedRun.status);
    const isAlreadyOwnedOrTerminal = [
      AgentRunStatus.RUNNING,
      AgentRunStatus.COMPLETED,
      AgentRunStatus.CANCELLED,
    ].includes(persistedStatus as AgentRunStatus);
    if (!isAlreadyOwnedOrTerminal) {
      await measure('enqueue', () =>
        this.queueService.queueRun({
          apiKeyContext: context.apiKeyContext
            ? {
                isApiKey: context.apiKeyContext.isApiKey,
                scopes: context.apiKeyContext.scopes,
              }
            : undefined,
          clientRequestId: request.clientRequestId,
          encryptedAuthToken: context.authToken
            ? this.credentialCryptoService.encrypt(context.authToken)
            : undefined,
          kind: 'agent-chat-turn',
          organizationId: context.organizationId,
          request: {
            ...request,
            clientRequestId: request.clientRequestId,
            threadId,
          },
          runId,
          threadId,
          userId: context.userId,
        }),
      );
    }

    this.logger.log(`${this.logContext} accepted turn`, {
      clientRequestId: request.clientRequestId,
      contextId,
      durationMs: Date.now() - acceptedAt,
      organizationId: context.organizationId,
      persistedStatus,
      runId,
      stageDurationMs,
      threadId,
    });

    return {
      brandId: thread.brandId ?? undefined,
      clientRequestId: request.clientRequestId,
      contextId,
      contextVersion,
      queuedAt,
      runId,
      status: 'queued',
      threadId,
    };
  }
}
