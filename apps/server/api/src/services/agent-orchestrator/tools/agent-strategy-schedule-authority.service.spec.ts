import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { AgentStrategyScheduleAuthorityService } from '@api/services/agent-orchestrator/tools/agent-strategy-schedule-authority.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => true,
}));

describe('AgentStrategyScheduleAuthorityService (#6689)', () => {
  const sessionActor = {
    isApiKey: false,
    organizationId: 'org-1',
    scopes: [],
    userId: 'admin-1',
  };
  const baseContext: ToolExecutionContext = {
    brandId: 'brand-1',
    isProactive: true,
    organizationId: 'org-1',
    strategyId: 'strategy-1',
    userId: 'owner-1',
  };

  let prisma: {
    agentStrategy: { findFirst: ReturnType<typeof vi.fn> };
    apiKey: { findFirst: ReturnType<typeof vi.fn> };
  };
  let brandAccess: {
    assert: ReturnType<typeof vi.fn>;
    resolve: ReturnType<typeof vi.fn>;
  };
  let logger: { warn: ReturnType<typeof vi.fn> };
  let service: AgentStrategyScheduleAuthorityService;

  function strategy(overrides: Record<string, unknown> = {}) {
    return {
      brandId: 'brand-1',
      config: {},
      scheduleInitiatingActor: sessionActor,
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = {
      agentStrategy: {
        findFirst: vi.fn().mockResolvedValue(strategy()),
      },
      apiKey: { findFirst: vi.fn() },
    };
    brandAccess = {
      assert: vi.fn().mockResolvedValue(undefined),
      resolve: vi.fn().mockResolvedValue({}),
    };
    logger = { warn: vi.fn() };
    service = new AgentStrategyScheduleAuthorityService(
      prisma as unknown as PrismaService,
      brandAccess as unknown as BrandAccessService,
      logger as unknown as LoggerService,
    );
  });

  it('binds the strategy actor to a strategy turn after reading its authority live', async () => {
    const result = await service.withScheduleAuthority(baseContext);

    expect(result.scheduleAuthorityPrincipal).toEqual(sessionActor);
    expect(brandAccess.resolve).toHaveBeenCalledWith(
      sessionActor,
      expect.anything(),
    );
    expect(brandAccess.assert).toHaveBeenCalledWith(
      sessionActor,
      'brand-1',
      expect.anything(),
    );
    expect(result.userId).toBe('owner-1');
  });

  it('reads the strategy inside the turn organization, active and not deleted', async () => {
    await service.withScheduleAuthority(baseContext);

    expect(prisma.agentStrategy.findFirst).toHaveBeenCalledWith({
      select: { brandId: true, config: true, scheduleInitiatingActor: true },
      where: {
        id: 'strategy-1',
        isActive: true,
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('uses the strategy brand when the turn carries none', async () => {
    await service.withScheduleAuthority({ ...baseContext, brandId: undefined });

    expect(brandAccess.assert).toHaveBeenCalledWith(
      sessionActor,
      'brand-1',
      expect.anything(),
    );
  });

  it('never infers the actor from the strategy owner', async () => {
    prisma.agentStrategy.findFirst.mockResolvedValue(
      strategy({ scheduleInitiatingActor: null }),
    );

    const result = await service.withScheduleAuthority(baseContext);

    expect(result).toBe(baseContext);
    expect(brandAccess.resolve).not.toHaveBeenCalled();
  });

  it.each([
    ['inactive or deleted (no row)', null],
    ['disabled through its config', strategy({ config: { isEnabled: false } })],
  ])(
    'leaves the schedule unbound when the strategy is %s',
    async (_label, row) => {
      prisma.agentStrategy.findFirst.mockResolvedValue(row);

      const result = await service.withScheduleAuthority(baseContext);

      expect(result.scheduleAuthorityPrincipal).toBeUndefined();
      expect(brandAccess.resolve).not.toHaveBeenCalled();
    },
  );

  it('leaves the schedule unbound when the actor is no longer a member', async () => {
    brandAccess.resolve.mockRejectedValue(
      new ForbiddenException('Brand access denied'),
    );

    const result = await service.withScheduleAuthority(baseContext);

    expect(result.scheduleAuthorityPrincipal).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('leaves the schedule unbound when the actor lost access to the brand', async () => {
    brandAccess.assert.mockRejectedValue(
      new ForbiddenException('Brand access denied'),
    );

    const result = await service.withScheduleAuthority(baseContext);

    expect(result.scheduleAuthorityPrincipal).toBeUndefined();
  });

  it('leaves the schedule unbound when the stored actor belongs to another organization', async () => {
    prisma.agentStrategy.findFirst.mockResolvedValue(
      strategy({
        scheduleInitiatingActor: { ...sessionActor, organizationId: 'org-2' },
      }),
    );

    const result = await service.withScheduleAuthority(baseContext);

    expect(result.scheduleAuthorityPrincipal).toBeUndefined();
    expect(brandAccess.resolve).not.toHaveBeenCalled();
  });

  it('leaves the schedule unbound when the stored actor is malformed', async () => {
    prisma.agentStrategy.findFirst.mockResolvedValue(
      strategy({ scheduleInitiatingActor: { userId: 'admin-1' } }),
    );

    const result = await service.withScheduleAuthority(baseContext);

    expect(result.scheduleAuthorityPrincipal).toBeUndefined();
  });

  describe('an API key actor', () => {
    const keyActor = {
      apiKeyId: 'key-1',
      isApiKey: true,
      organizationId: 'org-1',
      scopes: ['agents:write', 'workflows:write'],
      userId: 'admin-1',
    };

    beforeEach(() => {
      prisma.agentStrategy.findFirst.mockResolvedValue(
        strategy({ scheduleInitiatingActor: keyActor }),
      );
    });

    it('is bound with the scopes the key still has', async () => {
      prisma.apiKey.findFirst.mockResolvedValue({
        scopes: ['agents:write', 'brands:read'],
      });

      const result = await service.withScheduleAuthority(baseContext);

      expect(result.scheduleAuthorityPrincipal).toEqual({
        ...keyActor,
        scopes: ['agents:write'],
      });
    });

    it('is not bound once the key was revoked or expired', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);

      const result = await service.withScheduleAuthority(baseContext);

      expect(result.scheduleAuthorityPrincipal).toBeUndefined();
      expect(brandAccess.resolve).not.toHaveBeenCalled();
    });
  });

  it('does not read anything for a turn without a strategy', async () => {
    const { strategyId: _strategyId, ...ctx } = baseContext;

    const result = await service.withScheduleAuthority(ctx);

    expect(result).toBe(ctx);
    expect(prisma.agentStrategy.findFirst).not.toHaveBeenCalled();
  });

  it('keeps a live authenticated principal instead of replacing it with the strategy actor', async () => {
    const live = { ...sessionActor, userId: 'owner-1' };
    const ctx: ToolExecutionContext = {
      ...baseContext,
      initiatingPrincipal: live,
      isProactive: false,
    };

    const result = await service.withScheduleAuthority(ctx);

    expect(result).toBe(ctx);
    expect(prisma.agentStrategy.findFirst).not.toHaveBeenCalled();
  });

  it('does not unbind a schedule because of an outage', async () => {
    prisma.agentStrategy.findFirst.mockRejectedValue(new Error('db down'));

    await expect(service.withScheduleAuthority(baseContext)).rejects.toThrow(
      'db down',
    );
  });

  it('rethrows an unexpected failure of the live refresh', async () => {
    brandAccess.resolve.mockRejectedValue(new Error('db down'));

    await expect(service.withScheduleAuthority(baseContext)).rejects.toThrow(
      'db down',
    );
  });
});
