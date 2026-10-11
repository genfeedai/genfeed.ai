vi.unmock('@genfeedai/prisma');

import { parseWorkflowActor } from '@api/authorization/brand-access/workflow-actor.util';
import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { Prisma } from '@genfeedai/prisma';

describe('AgentStrategiesService schedule actor (#6689)', () => {
  const principal = {
    isApiKey: false,
    organizationId: 'org',
    scopes: [] as string[],
    userId: 'admin-1',
  };
  const boundActor = {
    isApiKey: false,
    organizationId: 'org',
    scopes: [],
    userId: 'admin-1',
  };
  const forgedActor = {
    isApiKey: false,
    organizationId: 'org',
    scopes: ['admin'],
    userId: 'attacker',
  };

  function setup(
    row: Record<string, unknown> = {},
    options: { isActive?: boolean } = {},
  ) {
    const state: Record<string, unknown> = {
      config: {},
      id: 'strategy',
      isActive: options.isActive ?? true,
      isDeleted: false,
      organizationId: 'org',
      policies: {},
      scheduleInitiatingActor: null,
      userId: 'owner-1',
      ...row,
    };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
      agentStrategy: {
        create: vi
          .fn()
          .mockImplementation(async ({ data }) => ({ ...state, ...data })),
        findFirst: vi.fn().mockImplementation(async () => state),
        update: vi
          .fn()
          .mockImplementation(async ({ data }) => Object.assign(state, data)),
      },
    };
    const service = new AgentStrategiesService(
      prisma as never,
      { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
    );
    return { prisma, service, state };
  }

  function createdData(prisma: ReturnType<typeof setup>['prisma']) {
    return prisma.agentStrategy.create.mock.calls[0]?.[0].data;
  }

  describe('save by an authenticated principal', () => {
    it('binds the creating principal to an active, enabled strategy in the shape parseWorkflowActor reads', async () => {
      const { prisma, service } = setup();

      await service.createWithClient(
        {
          label: 'Agent',
          organizationId: 'org',
          schedulePrincipal: principal,
          userId: 'owner-1',
        },
        prisma as never,
      );

      const written = createdData(prisma).scheduleInitiatingActor;
      expect(written).toEqual(boundActor);
      expect(parseWorkflowActor(written, 'org')).toEqual(boundActor);
      expect(createdData(prisma)).not.toHaveProperty('schedulePrincipal');
    });

    it('keeps an API key principal complete', async () => {
      const { prisma, service } = setup();

      await service.createWithClient(
        {
          label: 'Agent',
          organizationId: 'org',
          schedulePrincipal: {
            ...principal,
            apiKeyId: 'key-1',
            isApiKey: true,
            scopes: ['agents:write'],
          },
          userId: 'owner-1',
        },
        prisma as never,
      );

      expect(createdData(prisma).scheduleInitiatingActor).toEqual({
        apiKeyId: 'key-1',
        isApiKey: true,
        organizationId: 'org',
        scopes: ['agents:write'],
        userId: 'admin-1',
      });
    });

    it.each([
      ['inactive', { isActive: false }],
      ['disabled', { isEnabled: false }],
    ])(
      'does not bind a principal to a strategy created %s',
      async (_label, overrides) => {
        const { prisma, service } = setup();

        await service.createWithClient(
          {
            label: 'Agent',
            organizationId: 'org',
            schedulePrincipal: principal,
            userId: 'owner-1',
            ...overrides,
          },
          prisma as never,
        );

        expect(createdData(prisma)).not.toHaveProperty(
          'scheduleInitiatingActor',
        );
      },
    );

    it('leaves a strategy created without a principal unbound', async () => {
      const { prisma, service } = setup();

      await service.createWithClient(
        { label: 'Agent', organizationId: 'org', userId: 'owner-1' },
        prisma as never,
      );

      expect(createdData(prisma)).not.toHaveProperty('scheduleInitiatingActor');
    });

    it('rebinds the saving principal on an update of an enabled strategy', async () => {
      const { service, state } = setup({
        scheduleInitiatingActor: { ...boundActor, userId: 'earlier-admin' },
      });

      await service.patch('strategy', {
        label: 'Renamed',
        schedulePrincipal: principal,
      } as never);

      expect(state.scheduleInitiatingActor).toEqual(boundActor);
    });

    it('binds the activating principal when an inactive strategy is enabled', async () => {
      const { service, state } = setup({}, { isActive: false });

      await service.patch('strategy', {
        isActive: true,
        schedulePrincipal: principal,
      } as never);

      expect(state.isActive).toBe(true);
      expect(state.scheduleInitiatingActor).toEqual(boundActor);
    });

    it('does not bind a principal while the strategy stays inactive', async () => {
      const { service, state } = setup({}, { isActive: false });

      await service.patch('strategy', {
        label: 'Renamed',
        schedulePrincipal: principal,
      } as never);

      expect(state.scheduleInitiatingActor).toBe(Prisma.DbNull);
    });

    it('ignores a principal from another organization so an operator never becomes the actor', async () => {
      const { service, state } = setup({
        scheduleInitiatingActor: boundActor,
      });

      await service.patch('strategy', {
        label: 'Renamed',
        schedulePrincipal: {
          ...principal,
          organizationId: 'operator-org',
          userId: 'operator',
        },
      } as never);

      expect(state.scheduleInitiatingActor).toEqual(boundActor);
    });

    it('passes the activating principal through setActive', async () => {
      const { service } = setup();
      vi.spyOn(service, 'findOneById').mockResolvedValue({
        id: 'strategy',
        isActive: false,
      } as unknown as AgentStrategyDocument);
      const patch = vi
        .spyOn(service, 'patch')
        .mockResolvedValue({} as AgentStrategyDocument);

      await service.setActive('strategy', 'org', true, principal);

      expect(patch).toHaveBeenCalledWith(
        'strategy',
        expect.objectContaining({
          isActive: true,
          schedulePrincipal: principal,
        }),
      );
    });
  });

  describe('a save without a principal', () => {
    it('keeps the stored actor of an enabled strategy', async () => {
      const { service, state } = setup({ scheduleInitiatingActor: boundActor });

      await service.patch('strategy', { postsPerWeek: 3 } as never);
      await service.resetFailures('strategy');

      expect(state.scheduleInitiatingActor).toEqual(boundActor);
    });
  });

  describe('disabling clears the actor', () => {
    it('clears it when isActive is set to false, whoever supplies the principal', async () => {
      const { service, state } = setup({ scheduleInitiatingActor: boundActor });

      await service.patch('strategy', {
        isActive: false,
        schedulePrincipal: principal,
      } as never);

      expect(state.scheduleInitiatingActor).toBe(Prisma.DbNull);
    });

    it('clears it when isEnabled is set to false', async () => {
      const { service, state } = setup({ scheduleInitiatingActor: boundActor });

      await service.patch('strategy', { isEnabled: false } as never);

      expect(state.scheduleInitiatingActor).toBe(Prisma.DbNull);
    });

    it('clears it when config.isEnabled is false', async () => {
      const { service, state } = setup({ scheduleInitiatingActor: boundActor });

      await service.patch('strategy', {
        config: { isEnabled: false },
      } as never);

      expect(state.scheduleInitiatingActor).toBe(Prisma.DbNull);
    });

    it('clears it when the strategy was already disabled through its config', async () => {
      const { service, state } = setup({
        config: { isEnabled: false },
        scheduleInitiatingActor: boundActor,
      });

      await service.patch('strategy', { label: 'Renamed' } as never);

      expect(state.scheduleInitiatingActor).toBe(Prisma.DbNull);
    });

    it('clears it when repeated failures pause the strategy', async () => {
      const { service, state } = setup({
        config: { consecutiveFailures: 2 },
        scheduleInitiatingActor: boundActor,
      });

      await service.recordRun(
        'strategy',
        {
          completedAt: new Date(),
          contentGenerated: 0,
          creditsUsed: 0,
          startedAt: new Date(),
          status: 'FAILED' as never,
        },
        'org',
      );

      expect(state.isActive).toBe(false);
      expect(state.scheduleInitiatingActor).toBe(Prisma.DbNull);
    });

    it('keeps it through a failed run that does not pause the strategy', async () => {
      const { service, state } = setup({ scheduleInitiatingActor: boundActor });

      await service.recordRun(
        'strategy',
        {
          completedAt: new Date(),
          contentGenerated: 0,
          creditsUsed: 0,
          startedAt: new Date(),
          status: 'FAILED' as never,
        },
        'org',
      );

      expect(state.isActive).toBe(true);
      expect(state.scheduleInitiatingActor).toEqual(boundActor);
    });

    it.each([
      [
        'pauseStrategy',
        (service: AgentStrategiesService) => service.pauseStrategy('strategy'),
      ],
      [
        'requireManualReactivation',
        (service: AgentStrategiesService) =>
          service.requireManualReactivation('strategy'),
      ],
    ])('clears it on %s', async (_name, disable) => {
      const { service, state } = setup({ scheduleInitiatingActor: boundActor });

      await disable(service);

      expect(state.isActive).toBe(false);
      expect(state.scheduleInitiatingActor).toBe(Prisma.DbNull);
    });
  });

  describe('input and copies never supply the actor', () => {
    it('drops an actor smuggled into a create payload or its config', async () => {
      const { prisma, service } = setup();

      await service.createWithClient(
        {
          config: { scheduleInitiatingActor: forgedActor },
          label: 'Agent',
          organizationId: 'org',
          scheduleInitiatingActor: forgedActor,
          userId: 'owner-1',
        } as never,
        prisma as never,
      );

      expect(createdData(prisma)).not.toHaveProperty('scheduleInitiatingActor');
      expect(createdData(prisma).config).not.toHaveProperty(
        'scheduleInitiatingActor',
      );
    });

    it('drops an actor smuggled into an update payload or its config', async () => {
      const { service, state } = setup({ scheduleInitiatingActor: boundActor });

      await service.patch('strategy', {
        config: { scheduleInitiatingActor: forgedActor },
        scheduleInitiatingActor: forgedActor,
      } as never);

      expect(state.scheduleInitiatingActor).toEqual(boundActor);
      expect(state.config).not.toHaveProperty('scheduleInitiatingActor');
    });

    it('does not copy the actor of an existing strategy into a clone', async () => {
      const { prisma, service, state } = setup({
        scheduleInitiatingActor: boundActor,
      });
      const { id: _id, ...source } = state;

      await service.createWithClient(
        { ...source, label: 'Copy' } as never,
        prisma as never,
      );

      expect(createdData(prisma)).not.toHaveProperty('scheduleInitiatingActor');
    });

    it('binds the cloning principal, not the source actor, when a user saves the clone', async () => {
      const { prisma, service, state } = setup({
        scheduleInitiatingActor: forgedActor,
      });
      const { id: _id, ...source } = state;

      await service.createWithClient(
        { ...source, label: 'Copy', schedulePrincipal: principal } as never,
        prisma as never,
      );

      expect(createdData(prisma).scheduleInitiatingActor).toEqual(boundActor);
    });
  });
});
