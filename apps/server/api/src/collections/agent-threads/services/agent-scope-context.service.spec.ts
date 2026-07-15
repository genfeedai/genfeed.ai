import { AgentScopeContextService } from '@genfeedai/server';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';

const THREAD_ID = 'thread-1';
const ORGANIZATION_ID = 'org-1';
const USER_ID = 'user-1';
const BRAND_ID = 'brand-1';

function threadRow(overrides: Record<string, unknown> = {}) {
  return {
    brandId: BRAND_ID,
    contextVersion: 3,
    id: THREAD_ID,
    isDeleted: false,
    isLegacyBrandFallbackEligible: false,
    legacyBrandFallbackCount: 0,
    legacyBrandFallbackLastBrandId: null,
    legacyBrandFallbackLastSource: null,
    organizationId: ORGANIZATION_ID,
    scopeChangeProvenance: [],
    userId: USER_ID,
    ...overrides,
  };
}

describe('AgentScopeContextService', () => {
  let service: AgentScopeContextService;
  let prisma: {
    agentMessage: { findFirst: ReturnType<typeof vi.fn> };
    agentThread: {
      findFirst: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    brand: { findFirst: ReturnType<typeof vi.fn> };
  };
  const logger = { log: vi.fn() };

  beforeEach(() => {
    prisma = {
      agentMessage: { findFirst: vi.fn() },
      agentThread: {
        findFirst: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      brand: { findFirst: vi.fn().mockResolvedValue({ id: BRAND_ID }) },
    };
    logger.log.mockClear();
    service = new AgentScopeContextService(prisma as never, logger as never);
  });

  it('resolves an authorized thread scope from immutable server authority', async () => {
    prisma.agentThread.findFirst.mockResolvedValue(threadRow());

    const prepared = await service.prepareForTurn({
      expectedContextVersion: 3,
      organizationId: ORGANIZATION_ID,
      requestedBrandId: BRAND_ID,
      threadId: THREAD_ID,
      userId: USER_ID,
    });

    expect(prepared.existingScope).toEqual(
      expect.objectContaining({
        brandId: BRAND_ID,
        contextVersion: 3,
        isVersionExplicit: true,
        organizationId: ORGANIZATION_ID,
        threadId: THREAD_ID,
        userId: USER_ID,
      }),
    );
    expect(prisma.agentThread.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: THREAD_ID,
          isDeleted: false,
          organizationId: ORGANIZATION_ID,
          userId: USER_ID,
        },
      }),
    );
    expect(logger.log).toHaveBeenCalledWith(
      'agent_context_compatibility_read',
      {
        organizationId: ORGANIZATION_ID,
        resolution: 'current',
        source: 'explicit_thread_scope',
        telemetryQueryVersion: 1,
      },
    );
  });

  it('rejects a stale client version with the latest authoritative context', async () => {
    prisma.agentThread.findFirst.mockResolvedValue(threadRow());

    await expect(
      service.prepareForTurn({
        expectedContextVersion: 2,
        organizationId: ORGANIZATION_ID,
        threadId: THREAD_ID,
        userId: USER_ID,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'agent_context_version_conflict',
        context: expect.objectContaining({ contextVersion: 3 }),
      }),
    });
  });

  it('rejects forged inaccessible thread ids instead of creating replacements', async () => {
    prisma.agentThread.findFirst.mockResolvedValue(null);

    await expect(
      service.prepareForTurn({
        organizationId: ORGANIZATION_ID,
        threadId: 'foreign-thread',
        userId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('performs a tenant-scoped compare-and-swap mutation with bounded provenance', async () => {
    const original = threadRow({ brandId: null });
    const updated = threadRow({ brandId: BRAND_ID, contextVersion: 4 });
    prisma.agentThread.findFirst
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(updated);

    await service.mutateBrandScope({
      brandId: BRAND_ID,
      expectedContextVersion: 3,
      organizationId: ORGANIZATION_ID,
      threadId: THREAD_ID,
      userId: USER_ID,
    });

    expect(prisma.agentThread.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        brandId: BRAND_ID,
        contextVersion: { increment: 1 },
        isLegacyBrandFallbackEligible: false,
        scopeChangeProvenance: [
          expect.objectContaining({
            actorUserId: USER_ID,
            brandId: BRAND_ID,
            fromContextVersion: 3,
            previousBrandId: null,
            source: 'thread_context_api',
            toContextVersion: 4,
          }),
        ],
      }),
      where: {
        contextVersion: 3,
        id: THREAD_ID,
        isDeleted: false,
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
      },
    });
  });

  it('canonicalizes an explicitly brandless legacy thread through CAS', async () => {
    const original = threadRow({
      brandId: null,
      isLegacyBrandFallbackEligible: true,
    });
    const updated = threadRow({ brandId: null, contextVersion: 4 });
    prisma.agentThread.findFirst
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(updated);

    await service.mutateBrandScope({
      brandId: null,
      expectedContextVersion: 3,
      organizationId: ORGANIZATION_ID,
      threadId: THREAD_ID,
      userId: USER_ID,
    });

    expect(prisma.agentThread.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          brandId: null,
          contextVersion: { increment: 1 },
          isLegacyBrandFallbackEligible: false,
        }),
      }),
    );
  });

  it('rejects a brand outside the authenticated organization before CAS', async () => {
    prisma.agentThread.findFirst.mockResolvedValue(
      threadRow({ brandId: null }),
    );
    prisma.brand.findFirst.mockResolvedValue(null);

    await expect(
      service.mutateBrandScope({
        brandId: 'foreign-brand',
        expectedContextVersion: 3,
        organizationId: ORGANIZATION_ID,
        threadId: THREAD_ID,
        userId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.agentThread.updateMany).not.toHaveBeenCalled();
  });

  it('returns a conflict when another mutation wins the CAS race', async () => {
    prisma.agentThread.findFirst
      .mockResolvedValueOnce(threadRow({ brandId: null }))
      .mockResolvedValueOnce(threadRow({ contextVersion: 4 }));
    prisma.agentThread.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.mutateBrandScope({
        brandId: BRAND_ID,
        expectedContextVersion: 3,
        organizationId: ORGANIZATION_ID,
        threadId: THREAD_ID,
        userId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('uses and records the bounded legacy execution-policy fallback', async () => {
    prisma.agentThread.findFirst.mockResolvedValue(
      threadRow({
        brandId: null,
        isLegacyBrandFallbackEligible: true,
      }),
    );

    const prepared = await service.prepareForTurn({
      organizationId: ORGANIZATION_ID,
      policyBrandId: BRAND_ID,
      threadId: THREAD_ID,
      userId: USER_ID,
    });

    expect(prepared.existingScope).toEqual(
      expect.objectContaining({
        brandId: BRAND_ID,
        isLegacyFallback: true,
        source: 'legacy_execution_policy',
      }),
    );
    expect(prisma.agentThread.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          legacyBrandFallbackCount: { increment: 1 },
          legacyBrandFallbackLastBrandId: BRAND_ID,
          legacyBrandFallbackLastSource: 'legacy_execution_policy',
        }),
      }),
    );
  });

  it('expires legacy inference after the bounded compatibility window', async () => {
    prisma.agentThread.findFirst.mockResolvedValue(
      threadRow({
        brandId: null,
        isLegacyBrandFallbackEligible: true,
        legacyBrandFallbackCount: 20,
      }),
    );

    await expect(
      service.prepareForTurn({
        organizationId: ORGANIZATION_ID,
        policyBrandId: BRAND_ID,
        threadId: THREAD_ID,
        userId: USER_ID,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'legacy_agent_context_upgrade_required',
      }),
    });
    expect(prisma.agentThread.updateMany).not.toHaveBeenCalled();
  });

  it('emits content-free compatibility telemetry for bounded legacy reads', async () => {
    prisma.agentThread.findFirst.mockResolvedValue(
      threadRow({
        brandId: null,
        isLegacyBrandFallbackEligible: true,
        legacyBrandFallbackCount: 0,
      }),
    );

    await service.prepareForTurn({
      organizationId: ORGANIZATION_ID,
      policyBrandId: BRAND_ID,
      threadId: THREAD_ID,
      userId: USER_ID,
    });

    expect(logger.log).toHaveBeenCalledWith(
      'agent_context_compatibility_read',
      {
        organizationId: ORGANIZATION_ID,
        resolution: 'legacy',
        source: 'legacy_execution_policy',
        telemetryQueryVersion: 1,
      },
    );
  });

  it('requires an explicit version before strict consequential execution', async () => {
    await expect(
      service.assertConsequentialBoundary(
        {
          brandId: BRAND_ID,
          contextVersion: 3,
          isLegacyFallback: false,
          isVersionExplicit: false,
          organizationId: ORGANIZATION_ID,
          source: 'explicit',
          threadId: THREAD_ID,
          userId: USER_ID,
        },
        'tool',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.agentThread.findFirst).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      'conversation_shell_consequential_attempt',
      {
        boundary: 'tool',
        contextStatus: 'missing_version',
        organizationId: ORGANIZATION_ID,
        outcome: 'blocked',
        telemetryQueryVersion: 1,
      },
    );
  });

  it('revalidates version and brand immediately before a side effect', async () => {
    prisma.agentThread.findFirst.mockResolvedValue(
      threadRow({ contextVersion: 4 }),
    );

    await expect(
      service.assertConsequentialBoundary(
        {
          brandId: BRAND_ID,
          contextVersion: 3,
          isLegacyFallback: false,
          isVersionExplicit: true,
          organizationId: ORGANIZATION_ID,
          source: 'explicit',
          threadId: THREAD_ID,
          userId: USER_ID,
        },
        'publish',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a legacy action when a newer fallback scope superseded it', async () => {
    prisma.agentThread.findFirst.mockResolvedValue(
      threadRow({
        brandId: null,
        isLegacyBrandFallbackEligible: true,
        legacyBrandFallbackLastBrandId: 'brand-2',
        legacyBrandFallbackLastSource: 'legacy_message_history',
      }),
    );

    await expect(
      service.assertConsequentialBoundary(
        {
          brandId: BRAND_ID,
          contextVersion: 3,
          isLegacyFallback: true,
          isVersionExplicit: false,
          organizationId: ORGANIZATION_ID,
          source: 'legacy_execution_policy',
          threadId: THREAD_ID,
          userId: USER_ID,
        },
        'workflow',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
