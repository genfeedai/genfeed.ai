import { randomUUID } from 'node:crypto';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { McpApprovalsService } from '@api/collections/mcp-approvals/services/mcp-approvals.service';
import type { ThreadUiActionExecutionParams } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.types';
import { AgentOrchestratorUiActionMutationService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-mutation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { buildLogicalWriteKey } from '@genfeedai/actions';
import { AgentThreadMode } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

describe('atomic agent mutation admission with PostgreSQL', () => {
  let prisma: PrismaService;
  const userId = randomUUID();
  const organizationId = randomUUID();
  const threadId = randomUUID();
  let approvals: McpApprovalsService;

  beforeAll(async () => {
    const databaseUrl = new ConfigService().get('DATABASE_URL');
    const url = new URL(databaseUrl ?? '');
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      !url.pathname.includes('test')
    ) {
      throw new Error(
        'Mutation admission integration requires an explicit local test database.',
      );
    }
    prisma = new PrismaService({
      get: (key: string) => (key === 'DATABASE_URL' ? databaseUrl : undefined),
      mediaUrlConfig: { cdnUrl: 'https://example.test' },
    } as unknown as ConfigService);
    await prisma.$connect();
    await prisma.user.create({ data: { id: userId, handle: userId } });
    await prisma.organization.create({
      data: {
        id: organizationId,
        userId,
        label: 'Admission test',
        slug: organizationId,
      },
    });
    await prisma.agentThread.create({
      data: { id: threadId, userId, organizationId },
    });
    approvals = new McpApprovalsService(prisma, {} as never, {} as never);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.agentMessage.deleteMany({ where: { organizationId } });
    await prisma.mcpApproval.deleteMany({ where: { organizationId } });
    await prisma.agentThread.deleteMany({ where: { organizationId } });
    await prisma.setting.deleteMany({ where: { userId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('rolls back real consent when card persistence fails and never dispatches', async () => {
    const scope = {
      organizationId,
      userId,
      threadId,
      contextVersion: 1,
      isLegacyFallback: false,
      isVersionExplicit: true,
      source: 'explicit' as const,
    };
    const args = { count: 1, platforms: ['twitter'], topics: ['Test'] };
    const approval = await prisma.mcpApproval.create({
      data: {
        organizationId,
        userId,
        toolName: 'generate_content_batch',
        arguments: args,
        idempotencyKey: buildLogicalWriteKey({
          organizationId,
          userId,
          threadId,
          scope,
          arguments: args,
          toolName: 'generate_content_batch',
        }),
      },
    });
    const sourceActionId = `mutation-approval:${approval.id}`;
    const card = {
      id: sourceActionId,
      type: 'mutation_approval_card',
      data: {
        approvalId: approval.id,
        sourceActionId,
        scopeVersion: 1,
        status: 'pending',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    };
    const message = await prisma.agentMessage.create({
      data: {
        organizationId,
        threadId,
        role: 'assistant',
        metadata: { uiActions: [card] },
      },
    });
    const messages = {
      getMessagesByRoom: vi.fn().mockResolvedValue([message]),
    };
    const executor = {
      executeTool: vi.fn().mockResolvedValue({ success: true, creditsUsed: 1 }),
    };
    const resolve = vi.spyOn(approvals, 'resolve');
    resolve.mockImplementation(async (...args) => {
      const resolved = await McpApprovalsService.prototype.resolve.apply(
        approvals,
        args,
      );
      const transaction = args[5];
      if (transaction) {
        await transaction.agentMessage.deleteMany({
          where: { id: message.id, organizationId },
        });
      } else {
        await prisma.agentMessage.deleteMany({
          where: { id: message.id, organizationId },
        });
      }
      return resolved;
    });
    const service = new AgentOrchestratorUiActionMutationService(
      approvals,
      messages as never,
      executor as never,
      { finalizeStructuredAssistantTurn: vi.fn() } as never,
      prisma,
    );
    const params: ThreadUiActionExecutionParams = {
      threadId,
      model: 'test',
      context: { organizationId, userId, scope },
      payload: { approvalId: approval.id, sourceActionId },
    };
    await expect(service.execute('confirm_mutation', params)).rejects.toThrow();
    expect(executor.executeTool).not.toHaveBeenCalled();
    expect(
      await prisma.mcpApproval.findFirst({
        where: { id: approval.id, organizationId, isDeleted: false },
      }),
    ).toMatchObject({ status: 'PENDING', resolvedAt: null });
    expect(
      await prisma.agentMessage.findFirst({
        where: { id: message.id, organizationId, isDeleted: false },
      }),
    ).toMatchObject({ metadata: { uiActions: [card] } });
    resolve.mockRestore();
  });

  it.each([undefined, threadId])(
    'rolls back mode changes for a deleted setting (thread %s)',
    async (selectedThread) => {
      await prisma.setting.upsert({
        where: { userId },
        create: { userId, agentMode: 'manual', isDeleted: true },
        update: { agentMode: 'manual', isDeleted: true },
      });
      const service = new AgentThreadsService(prisma, {} as never, {} as never);
      await expect(
        service.updateAgentMode(
          userId,
          organizationId,
          AgentThreadMode.AUTO,
          selectedThread,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(
        await prisma.setting.findUnique({ where: { userId } }),
      ).toMatchObject({ agentMode: 'manual', isDeleted: true });
      expect(
        await prisma.agentThread.findFirst({
          where: { id: threadId, organizationId, isDeleted: false },
        }),
      ).toMatchObject({ mode: 'manual' });
    },
  );
});
