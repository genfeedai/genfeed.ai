import { AgentUntrustedContentAuditsService } from '@api/collections/agent-untrusted-content-audits/services/agent-untrusted-content-audits.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';

describe('AgentUntrustedContentAuditsService origin mapping', () => {
  it.each(['agent', 'mcp'] as const)(
    'persists and reads explicit %s origin without result content',
    async (origin) => {
      const create = vi.fn(async ({ data }) => ({
        ...data,
        id: 'audit',
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
      }));
      const service = new AgentUntrustedContentAuditsService({
        agentUntrustedContentAudit: { create },
      } as unknown as PrismaService);
      const document = await service.createAudit({
        origin,
        organizationId: 'org',
        userId: 'user',
        confidence: 0.99,
        contentLength: 100,
        minConfidence: 0.95,
        mode: 'shadow',
        outcome: 'shadow_flagged',
        source: 'connector',
        toolName: 'get_account',
      });
      expect(document.origin).toBe(origin);
      expect(create.mock.calls[0][0].data).toMatchObject({
        origin,
        agentThreadId: null,
        agentStrategyId: null,
        brandId: null,
        workflowExecutionId: null,
      });
      expect(create.mock.calls[0][0].data).not.toHaveProperty('content');
    },
  );
});
